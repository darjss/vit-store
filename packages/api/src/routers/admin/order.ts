import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
	customerQueries,
	orderQueries,
	paymentQueries,
	productQueries,
	salesQueries,
} from "@vit/api/queries";
import {
	addOrderSchema,
	patchOrderHeaderSchema,
	timeRangeSchema,
	updateOrderSchema,
} from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, paymentStatus } from "~/lib/constants";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { createDelivery, getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { planPaymentTransition } from "./order-transition";
import { db } from "~/db/client";
import { SalesTable } from "~/db/schema";
import { getAverageCostOfProduct } from "~/queries/payments";
import { applyStockTransition, type StockTransition } from "~/lib/stock/transition";
import { scheduleRestockDispatches } from "~/lib/restock";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";

// Factory: the order router is identical for every caller — only the procedure
// wrapper (admin session auth vs bot token auth) differs. Resolver bodies stay
// exactly as-is; `proc` is the only thing that varies.
export function buildOrderRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addOrder: proc.input(addOrderSchema).mutation(async ({ ctx, input }) => {
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) => acc + currentProduct.price * currentProduct.quantity,
					0,
				);
				// Customer create/update stays outside the order transaction: it is
				// idempotent and not order-critical. The order insert, order-details
				// insert, sales rows, stock deductions, and payment insert are all
				// atomic so a payment-create failure (or any other failure) rolls
				// back the whole order — no orphaned order with deducted stock and
				// recorded sales but no payment row.
				if (input.isNewCustomer) {
					const existingCustomer = await customerQueries.admin.getCustomerByPhone(
						Number(input.customerPhone),
					);
					if (!existingCustomer) {
						await customerQueries.admin.createCustomer({
							address: input.address,
							phone: Number(input.customerPhone),
						});
					} else if (input.address && input.address !== existingCustomer.address) {
						await customerQueries.admin.updateCustomer(Number(input.customerPhone), {
							address: input.address,
						});
					}
				}
				const orderNumber = generateOrderNumber();
				const paymentNumber = generatePaymentNumber();
				const orderDetails = input.products.map((product) => ({
					price: product.price,
					productId: product.productId,
					quantity: product.quantity,
				}));
				const { orderId, stockTransitions } = await db().transaction(async (tx) => {
					const stockTransitions: Array<StockTransition> = [];
					const order = await orderQueries.admin.createOrderTx(tx, {
						address: input.address,
						customerPhone: Number(input.customerPhone),
						deliveryProvider: input.deliveryProvider,
						notes: input.notes ?? null,
						orderNumber,
						status: input.status,
						total: orderTotal,
					});
					const orderId = order?.orderId;
					await orderQueries.admin.createOrderDetailsTx(tx, orderId, orderDetails);
					if (input.paymentStatus === "success") {
						for (const product of input.products) {
							const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
							await salesQueries.admin.addSaleTx(tx, {
								orderId,
								productCost,
								productId: product.productId,
								quantitySold: product.quantity,
								sellingPrice: product.price,
							});
							const transition = await productQueries.admin.updateStockTx(
								tx,
								product.productId,
								product.quantity,
								"minus",
							);
							if (transition) {
								stockTransitions.push(transition);
							}
						}
					}
					await paymentQueries.admin.createPaymentTx(tx, {
						amount: orderTotal,
						orderId,
						paymentNumber,
						provider: "transfer",
						status: input.paymentStatus,
					});
					return { orderId, stockTransitions };
				});
				await purgeCatalogCache(
					ctx,
					stockTransitions.map((transition) => transition.productId),
				);
				ctx.log.info("payment.created", {
					amount: orderTotal,
					orderId,
					payment_status: input.paymentStatus,
					paymentNumber,
					provider: "transfer",
				});
				ctx.log.info("order.created", {
					customerPhone: Number(input.customerPhone),
					itemCount: input.products.length,
					order_status: input.status,
					orderId,
					orderNumber,
					total: orderTotal,
				});
				return { message: "Order added successfully" };
			} catch (error) {
				if (error instanceof TRPCError) {throw error;}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_add_failed",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add order",
				});
			}
		}),
		deleteOrder: proc.input(v.object({ id: v.number() })).mutation(async ({ ctx, input }) => {
			try {
				const restockCandidates = await db().transaction(async (tx) => {
					const stockTransitions: Array<StockTransition> = [];
					const orderDetails = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, input.id);
					const latestPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(
						tx,
						input.id,
					);
					const stockWasDeducted = latestPayment?.status === "success";
					if (stockWasDeducted) {
						for (const detail of orderDetails.filter((detail) => !detail.deletedAt)) {
							const transition = await productQueries.admin.updateStockTx(
								tx,
								detail.productId,
								detail.quantity,
								"add",
							);
							if (transition) {stockTransitions.push(transition);}
						}
					}
					await orderQueries.admin.softDeleteOrderTx(tx, input.id);
					return stockTransitions;
				});
				const changedProductIds = [...new Set(restockCandidates.map((item) => item.productId))];
				await purgeCatalogCache(ctx, changedProductIds);
				scheduleRestockDispatches(ctx, restockCandidates);
				ctx.log.warn("order.cancelled", { orderId: input.id });
				return { message: "Order deleted successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_delete_failed",
					orderId: input.id,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete order",
				});
			}
		}),
		getAllOrders: proc.query(async ({ ctx }) => {
			try {
				const orders = await orderQueries.admin.getAllOrders();
				return orders;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.orders_fetch_failed",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch orders",
				});
			}
		}),
		getDeliveryAddressZones: proc.query(async ({ ctx }) => {
			try {
				return await getDeliveryAddressZones();
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "order.fetch_zones_failed",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch delivery zones",
				});
			}
		}),
		getOrderById: proc.input(v.object({ id: v.number() })).query(async ({ ctx, input }) => {
			try {
				const result = await orderQueries.admin.getOrderById(input.id);
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Order not found",
					});
				}
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {throw error;}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_fetch_failed",
					orderId: input.id,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order",
				});
			}
		}),
		getOrderCount: proc.input(v.object({ timeRange: timeRangeSchema })).query(async ({ input }) => {
			return await orderQueries.admin.getOrderCount(input.timeRange);
		}),
		getOrderIdByOrderNumber: proc
			.input(v.object({ orderNumber: v.pipe(v.string(), v.minLength(1)) }))
			.query(async ({ ctx, input }) => {
				try {
					const order = await orderQueries.store.getOrderByOrderNumber(input.orderNumber);
					return order?.id ?? null;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.order_number_lookup_failed",
						orderNumber: input.orderNumber,
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to resolve order number",
					});
				}
			}),
		getPaginatedOrders: proc
			.input(
				v.object({
					createdAfter: v.optional(v.date()),
					date: v.optional(v.string()),
					includeAllStatuses: v.optional(v.boolean()),
					orderStatus: v.optional(
						v.picklist(["created", "pending", "shipped", "delivered", "cancelled", "refunded"]),
					),
					orderStatuses: v.optional(
						v.array(
							v.picklist(["created", "pending", "shipped", "delivered", "cancelled", "refunded"]),
						),
					),
					page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
					pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
					paymentStatus: v.optional(v.picklist(paymentStatus)),
					searchTerm: v.optional(v.string()),
					sortDirection: v.optional(v.picklist(["asc", "desc"])),
					sortField: v.optional(v.string()),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await orderQueries.admin.getPaginatedOrders({
						createdAfter: input.createdAfter,
						date: input.date,
						includeAllStatuses: input.includeAllStatuses,
						orderStatus: input.orderStatus,
						orderStatuses: input.orderStatuses,
						page: input.page ?? 1,
						pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
						paymentStatus: input.paymentStatus,
						searchTerm: input.searchTerm,
						sortDirection: input.sortDirection,
						sortField: input.sortField,
					});
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.orders_paginated_fetch_failed",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch paginated orders",
					});
				}
			}),
		getPendingOrders: proc.query(async () => {
			return await orderQueries.admin.getPendingOrders();
		}),
		getRecentOrdersByProductId: proc
			.input(v.object({ productId: v.number() }))
			.query(async ({ ctx, input }) => {
				try {
					const orders = await orderQueries.admin.getRecentOrdersByProductId(input.productId);
					return orders;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.recent_orders_fetch_failed",
						productId: input.productId,
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to fetch recent orders",
					});
				}
			}),
		patchOrderHeader: proc.input(patchOrderHeaderSchema).mutation(async ({ ctx, input }) => {
			try {
				const { customerPhone, id, ...rest } = input;
				const patch: {
					address?: string;
					addressZoneId?: number | null;
					customerPhone?: number;
					deliveryProvider?: typeof rest.deliveryProvider;
					notes?: string | null;
					status?: typeof rest.status;
				} = { ...rest };
				if (customerPhone !== undefined) {
					patch.customerPhone = Number(customerPhone);
				}
				await orderQueries.admin.patchOrderHeader(id, patch);
				ctx.log.info("order.header_patched", {
					fields: Object.keys(rest),
					orderId: id,
				});
				return { message: "Order header patched successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_header_patch_failed",
					orderId: input.id,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to patch order header",
				});
			}
		}),
		restoreOrder: proc.input(v.object({ id: v.number() })).mutation(async ({ ctx, input }) => {
			try {
				const restockCandidates = await db().transaction(async (tx) => {
					const stockTransitions: Array<StockTransition> = [];
					const details = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, input.id);
					const latestPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(
						tx,
						input.id,
					);
					const stockWasDeducted = latestPayment?.status === "success";
					if (stockWasDeducted) {
						for (const d of details.filter(
							(d) => d.deletedAt !== null && d.deletedAt !== undefined,
						)) {
							const transition = await productQueries.admin.updateStockTx(
								tx,
								d.productId,
								d.quantity,
								"minus",
							);
							if (transition) {stockTransitions.push(transition);}
						}
					}
					await orderQueries.admin.restoreOrderTx(tx, input.id);
					return stockTransitions;
				});
				const changedProductIds = [...new Set(restockCandidates.map((item) => item.productId))];
				await purgeCatalogCache(ctx, changedProductIds);
				ctx.log.info("admin.action", {
					action: "restore_order",
					targetId: input.id,
					targetType: "order",
				});
				return { message: "Order restored successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_restore_failed",
					orderId: input.id,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to restore order",
				});
			}
		}),
		searchOrder: proc
			.input(v.object({ searchTerm: v.string() }))
			.mutation(async ({ ctx, input }) => {
				try {
					const orders = await orderQueries.admin.searchOrder(input.searchTerm);
					return orders;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.order_search_failed",
						searchTerm: input.searchTerm,
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to search order",
					});
				}
			}),
		searchOrderQuick: proc
			.input(
				v.object({
					limit: v.optional(v.number(), 5),
					query: v.pipe(v.string(), v.minLength(1)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					return await orderQueries.admin.searchOrdersQuick(input.query, input.limit);
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.order_search_quick_failed",
						query: input.query,
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to search order quick",
					});
				}
			}),
		shipOrder: proc
			.input(
				v.object({
					addressZoneId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
					orderId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const order = await orderQueries.admin.getOrderById(input.orderId);
				if (!order) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Захиалга олдсонгүй",
					});
				}
				if (order.status !== "pending") {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Зөвхөн хүлээгдэж буй захиалгыг илгээх боломжтой",
					});
				}
				try {
					const deliveryResult = await createDelivery(
						order.id,
						order.orderNumber,
						String(order.customerPhone),
						input.addressZoneId,
						order.address,
						order.notes,
					);
					await orderQueries.admin.updateOrderStatus(order.id, "shipped", {
						addressZoneId: input.addressZoneId,
						deliveryProvider: "tu-delivery",
					});
					ctx.log.info("order.status_changed", {
						order_status: "shipped",
						orderId: order.id,
					});
					return {
						deliveryOrderId: deliveryResult.orderId,
						documentNo: deliveryResult.documentNo,
						orderId: order.id,
						orderNumber: order.orderNumber,
					};
				} catch (error) {
					if (error instanceof TRPCError) {throw error;}
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.ship_order_failed",
						orderId: input.orderId,
					});
					const message = error instanceof Error ? error.message : "Захиалга илгээхэд алдаа гарлаа";
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message,
					});
				}
			}),
		updateOrder: proc.input(updateOrderSchema).mutation(async ({ ctx, input }) => {
			try {
				const orderTotal = input.products.reduce(
					(acc, currentProduct) => acc + currentProduct.price * currentProduct.quantity,
					0,
				);
				if (input.isNewCustomer) {
					const existingCustomer = await customerQueries.admin.getCustomerByPhone(
						Number(input.customerPhone),
					);
					if (!existingCustomer) {
						await customerQueries.admin.createCustomer({
							address: input.address,
							phone: Number(input.customerPhone),
						});
					} else {
						await customerQueries.admin.updateCustomer(Number(input.customerPhone), {
							address: input.address,
						});
					}
				}
				// Critical section: order header update, order-detail replacement,
				// prev-status read, sales insert, stock changes, and payment
				// update in one transaction so a rollback can't leave the header
				// or lines updated while sales/stock/payment stay untouched, and
				// concurrent saves can't both observe prev=pending and double-book.
				//
				// Invariant: each order line's stock is deducted EXACTLY ONCE,
				// when payment transitions to success. This matches addOrder
				// (deducts on creation with paymentStatus==="success") and
				// confirmPaymentAndApplyStock (deducts on transition to success).
				// Pending orders never touch stock.
				const restockCandidates = await db().transaction(async (tx) => {
					const stockTransitions: Array<StockTransition> = [];
					const applyRequiredStockTransition = async (productId: number, delta: number) => {
						const transition = await applyStockTransition(tx, {
							delta,
							productId,
							requireActive: true,
							requireNonNegative: true,
						});
						if (!transition)
							{throw new Error(`Unable to apply stock transition for product ${productId}`);}
						stockTransitions.push(transition);
					};
					await orderQueries.admin.updateOrderTx(tx, input.id, {
						address: input.address,
						addressZoneId: input.addressZoneId ?? null,
						customerPhone: Number(input.customerPhone),
						deliveryProvider: input.deliveryProvider,
						notes: input.notes,
						status: input.status,
						total: orderTotal,
					});
					const currentOrderDetails = await orderQueries.admin.getOrderDetailsByOrderIdTx(
						tx,
						input.id,
					);
					await orderQueries.admin.deleteOrderDetailsTx(tx, input.id);
					await orderQueries.admin.createOrderDetailsTx(
						tx,
						input.id,
						input.products.map((product) => ({
							price: product.price,
							productId: product.productId,
							quantity: product.quantity,
						})),
					);
					const prevPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(tx, input.id);
					const prevPaymentStatus = prevPayment?.status ?? "pending";
					const { transitionedToSuccess } = planPaymentTransition(
						prevPaymentStatus,
						input.paymentStatus,
					);
					const wasSuccess = prevPaymentStatus === "success";
					for (const product of input.products) {
						const existingDetail = currentOrderDetails.find(
							(detail) => detail.productId === product.productId,
						);
						if (transitionedToSuccess) {
							const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
							await tx.insert(SalesTable).values({
								orderId: input.id,
								productCost,
								productId: product.productId,
								quantitySold: product.quantity,
								sellingPrice: product.price,
							});
							await applyRequiredStockTransition(product.productId, -product.quantity);
						} else if (wasSuccess) {
							if (existingDetail) {
								const quantityDiff = product.quantity - existingDetail.quantity;
								if (quantityDiff !== 0) {
									await applyRequiredStockTransition(product.productId, -quantityDiff);
								}
							} else {
								await applyRequiredStockTransition(product.productId, -product.quantity);
							}
						}
						// else: pending/other — no stock changes (deducted on transition)
					}
					if (wasSuccess && !transitionedToSuccess) {
						const removedProducts = currentOrderDetails.filter(
							(detail) => !input.products.some((p) => p.productId === detail.productId),
						);
						for (const detail of removedProducts) {
							await applyRequiredStockTransition(detail.productId, detail.quantity);
						}
						// Sync SalesTable to the edited order details so dashboard
						// revenue/profit analytics match reality. Previously paid-
						// order edits adjusted stock but left SalesTable stale
						// (wrong quantitySold/sellingPrice, missing rows for added
						// lines, phantom rows for removed lines). Soft-delete all
						// existing sales for this order and re-insert from the
						// current product list — same delete+recreate pattern used
						// for order details above.
						await tx
							.update(SalesTable)
							.set({ deletedAt: new Date() })
							.where(eq(SalesTable.orderId, input.id));
						for (const product of input.products) {
							const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
							await tx.insert(SalesTable).values({
								orderId: input.id,
								productCost,
								productId: product.productId,
								quantitySold: product.quantity,
								sellingPrice: product.price,
							});
						}
					}
					await paymentQueries.admin.updatePaymentStatusTx(tx, input.id, input.paymentStatus);
					ctx.log.info("order.updated", {
						order_status: input.status,
						orderId: input.id,
						payment_transitioned: transitionedToSuccess,
						total: orderTotal,
					});
					return stockTransitions;
				});
				const changedProductIds = [...new Set(restockCandidates.map((item) => item.productId))];
				await purgeCatalogCache(ctx, changedProductIds);
				scheduleRestockDispatches(ctx, restockCandidates);
				return { message: "Order updated successfully" };
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "admin.order_update_failed",
					orderId: input.id,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update order",
				});
			}
		}),
		updateOrderStatus: proc
			.input(
				v.object({
					id: v.number(),
					status: v.picklist(["pending", "shipped", "delivered", "cancelled", "refunded"]),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const updated = await orderQueries.admin.updateOrderStatus(
						input.id,
						input.status,
						input.status === "shipped" ? { fromStatus: "pending" } : undefined,
					);
					if (!updated && input.status === "shipped") {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "Зөвхөн хүлээгдэж буй захиалгыг илгээсэн болгох боломжтой",
						});
					}
					ctx.log.info("order.status_changed", {
						order_status: input.status,
						orderId: input.id,
					});
					return {
						message: `Order status updated successfully to ${input.status}`,
					};
				} catch (error) {
					if (error instanceof TRPCError) {throw error;}
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "admin.order_status_update_failed",
						order_status: input.status,
						orderId: input.id,
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to update order status",
					});
				}
			}),
	});
}

// Existing export — unchanged behavior (admin session auth).
export const order = buildOrderRouter(adminProcedure);
// Bot-facing twin — same resolvers, token-authed procedure for the admin agent.
export const orderBot = buildOrderRouter(botProcedure);
