import {
	adminBatchSuccessSchema,
	adminMutationSuccessSchema,
	adminOrderErrorSchema,
	adminShipOrderSuccessSchema,
	type AdminBatchFailure,
	type AdminOrderError,
	type addOrderType,
	type patchOrderHeaderType,
	type updateOrderType,
} from "@vit/shared";
import { Result } from "better-result";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { match } from "dismatch";
import {
	deliverySubmissionFailed,
	invalidOrderTransition,
	orderNotFound,
	orderStockConflict,
} from "~/errors/factories/admin";
import { db } from "~/db/client";
import {
	OrdersTable,
	PaymentsTable,
	ProductsTable,
	SalesTable,
} from "~/db/schema";
import { purgeCatalogCache } from "~/lib/cache/workers-cache";
import type { Context } from "~/lib/context";
import { createDelivery } from "~/lib/integrations/delivery";
import { scheduleRestockDispatches } from "~/lib/restock";
import {
	applyStockTransition,
	type StockTransition,
} from "~/lib/stock/transition";
import type { TransactionType } from "~/lib/types";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { customerQueries } from "~/queries/customers";
import { orderQueries } from "~/queries/orders";
import { getAverageCostOfProduct, paymentQueries } from "~/queries/payments";
import { productQueries } from "~/queries/products";
import { salesQueries } from "~/queries/sales";
import type { LegacyTrpcError } from "~/result/legacy-trpc";
import { planPaymentTransition } from "~/routers/admin/order-transition";
import { aggregateBatchResult } from "./batch-result";

export { aggregateBatchResult } from "./batch-result";

export const adminOrderMutationResultSchemas = {
	value: adminMutationSuccessSchema,
	error: adminOrderErrorSchema,
};
export const adminShipOrderResultSchemas = {
	value: adminShipOrderSuccessSchema,
	error: adminOrderErrorSchema,
};
export const adminOrderBatchResultSchemas = {
	value: adminBatchSuccessSchema,
	error: adminOrderErrorSchema,
};

type StockDelta = { productId: number; delta: number };

const aggregateStockDeltas = (deltas: StockDelta[]) => {
	const totals = new Map<number, number>();
	for (const delta of deltas) {
		totals.set(
			delta.productId,
			(totals.get(delta.productId) ?? 0) + delta.delta,
		);
	}
	return [...totals].map(([productId, delta]) => ({ productId, delta }));
};

const lockAndValidateStock = async (
	tx: TransactionType,
	deltas: StockDelta[],
	options: { requireActive: boolean; requireNonNegative: boolean },
) => {
	const aggregated = aggregateStockDeltas(deltas).filter(
		(item) => item.delta !== 0,
	);
	if (aggregated.length === 0) return Result.ok(aggregated);
	const ids = aggregated.map((item) => item.productId);
	const products = await tx
		.select({
			id: ProductsTable.id,
			stock: ProductsTable.stock,
			status: ProductsTable.status,
		})
		.from(ProductsTable)
		.where(and(inArray(ProductsTable.id, ids), isNull(ProductsTable.deletedAt)))
		.for("update");
	const byId = new Map(products.map((product) => [product.id, product]));
	const conflicts: Array<{
		productId: number;
		requested: number;
		available?: number;
	}> = [];
	for (const item of aggregated) {
		const product = byId.get(item.productId);
		if (!product) {
			conflicts.push({ productId: item.productId, requested: -item.delta });
			continue;
		}
		if (
			(options.requireActive && product.status !== "active") ||
			(options.requireNonNegative && product.stock + item.delta < 0)
		) {
			conflicts.push({
				productId: item.productId,
				requested: Math.max(-item.delta, 0),
				available: product.stock,
			});
		}
	}
	return conflicts.length > 0
		? Result.err(orderStockConflict(conflicts))
		: Result.ok(aggregated);
};

const applyLockedStockDeltas = async (
	tx: TransactionType,
	deltas: StockDelta[],
	options: { requireActive: boolean; requireNonNegative: boolean },
) => {
	const transitions: StockTransition[] = [];
	for (const item of deltas) {
		const transition = await applyStockTransition(tx, {
			productId: item.productId,
			delta: item.delta,
			...options,
		});
		if (!transition) {
			throw new Error("Locked stock transition was not applied");
		}
		transitions.push(transition);
	}
	return transitions;
};

const syncCustomer = async (input: addOrderType | updateOrderType) => {
	if (!input.isNewCustomer) return;
	const phone = Number(input.customerPhone);
	const existing = await customerQueries.admin.getCustomerByPhone(phone);
	if (!existing) {
		await customerQueries.admin.createCustomer({
			phone,
			address: input.address,
		});
		return;
	}
	if (input.address && input.address !== existing.address) {
		await customerQueries.admin.updateCustomer(phone, {
			address: input.address,
		});
	}
};

export const addOrder = async (ctx: Context, input: addOrderType) => {
	await syncCustomer(input);
	const total = input.products.reduce(
		(sum, product) => sum + product.price * product.quantity,
		0,
	);
	const orderNumber = generateOrderNumber();
	const paymentNumber = generatePaymentNumber();
	const committed = await db().transaction(async (tx) => {
		const requiredDeltas =
			input.paymentStatus === "success"
				? input.products.map((product) => ({
						productId: product.productId,
						delta: -product.quantity,
					}))
				: [];
		const stockPlan = await lockAndValidateStock(tx, requiredDeltas, {
			requireActive: true,
			requireNonNegative: true,
		});
		if (stockPlan.status === "error") return stockPlan;

		const order = await orderQueries.admin.createOrderTx(tx, {
			orderNumber,
			customerPhone: Number(input.customerPhone),
			status: input.status,
			notes: input.notes ?? null,
			total,
			address: input.address,
			deliveryProvider: input.deliveryProvider,
		});
		if (!order) throw new Error("Order insert returned no row");
		await orderQueries.admin.createOrderDetailsTx(
			tx,
			order.orderId,
			input.products.map((product) => ({
				productId: product.productId,
				quantity: product.quantity,
				price: product.price,
			})),
		);
		if (input.paymentStatus === "success") {
			for (const product of input.products) {
				await salesQueries.admin.addSaleTx(tx, {
					productCost: await getAverageCostOfProduct(
						tx,
						product.productId,
						new Date(),
					),
					quantitySold: product.quantity,
					orderId: order.orderId,
					sellingPrice: product.price,
					productId: product.productId,
				});
			}
		}
		const stockTransitions = await applyLockedStockDeltas(tx, stockPlan.value, {
			requireActive: true,
			requireNonNegative: true,
		});
		await paymentQueries.admin.createPaymentTx(tx, {
			paymentNumber,
			orderId: order.orderId,
			provider: "transfer",
			status: input.paymentStatus,
			amount: total,
		});
		return Result.ok({ orderId: order.orderId, stockTransitions });
	});
	if (committed.status === "error") return committed;

	await purgeCatalogCache(
		ctx,
		committed.value.stockTransitions.map((transition) => transition.productId),
	);
	ctx.log.info("payment.created", {
		paymentNumber,
		orderId: committed.value.orderId,
		amount: total,
		provider: "transfer",
		payment_status: input.paymentStatus,
	});
	ctx.log.info("order.created", {
		orderId: committed.value.orderId,
		orderNumber,
		total,
		itemCount: input.products.length,
		order_status: input.status,
	});
	return Result.ok({ message: "Order added successfully" });
};

export const updateOrder = async (ctx: Context, input: updateOrderType) => {
	await syncCustomer(input);
	const total = input.products.reduce(
		(sum, product) => sum + product.price * product.quantity,
		0,
	);
	const committed = await db().transaction(async (tx) => {
		const existingOrder = await tx.query.OrdersTable.findFirst({
			where: and(eq(OrdersTable.id, input.id), isNull(OrdersTable.deletedAt)),
		});
		if (!existingOrder) return Result.err(orderNotFound());

		const currentDetails = await orderQueries.admin.getOrderDetailsByOrderIdTx(
			tx,
			input.id,
		);
		const previousPayment =
			await paymentQueries.admin.getLatestPaymentByOrderIdTx(tx, input.id);
		const previousStatus = previousPayment?.status ?? "pending";
		const { transitionedToSuccess, wasSuccess } = planPaymentTransition(
			previousStatus,
			input.paymentStatus,
		);
		const stockDeltas: StockDelta[] = [];
		for (const product of input.products) {
			const existingDetail = currentDetails.find(
				(detail) => product.productId === detail.productId,
			);
			if (transitionedToSuccess) {
				stockDeltas.push({
					productId: product.productId,
					delta: -product.quantity,
				});
			} else if (wasSuccess) {
				stockDeltas.push({
					productId: product.productId,
					delta: -(product.quantity - (existingDetail?.quantity ?? 0)),
				});
			}
		}
		if (wasSuccess && !transitionedToSuccess) {
			for (const detail of currentDetails.filter(
				(detail) =>
					!input.products.some(
						(product) => product.productId === detail.productId,
					),
			)) {
				stockDeltas.push({
					productId: detail.productId,
					delta: detail.quantity,
				});
			}
		}
		const stockPlan = await lockAndValidateStock(tx, stockDeltas, {
			requireActive: true,
			requireNonNegative: true,
		});
		if (stockPlan.status === "error") return stockPlan;

		await orderQueries.admin.updateOrderTx(tx, input.id, {
			customerPhone: Number(input.customerPhone),
			status: input.status,
			notes: input.notes,
			total,
			address: input.address,
			addressZoneId: input.addressZoneId ?? null,
			deliveryProvider: input.deliveryProvider,
		});
		await orderQueries.admin.deleteOrderDetailsTx(tx, input.id);
		await orderQueries.admin.createOrderDetailsTx(
			tx,
			input.id,
			input.products.map((product) => ({
				productId: product.productId,
				quantity: product.quantity,
				price: product.price,
			})),
		);

		if (transitionedToSuccess || wasSuccess) {
			await tx
				.update(SalesTable)
				.set({ deletedAt: new Date() })
				.where(eq(SalesTable.orderId, input.id));
			for (const product of input.products) {
				await tx.insert(SalesTable).values({
					productCost: await getAverageCostOfProduct(
						tx,
						product.productId,
						new Date(),
					),
					quantitySold: product.quantity,
					orderId: input.id,
					sellingPrice: product.price,
					productId: product.productId,
				});
			}
		}
		const transitions = await applyLockedStockDeltas(tx, stockPlan.value, {
			requireActive: true,
			requireNonNegative: true,
		});
		await paymentQueries.admin.updatePaymentStatusTx(
			tx,
			input.id,
			input.paymentStatus,
		);
		return Result.ok(transitions);
	});
	if (committed.status === "error") return committed;

	const changedProductIds = [
		...new Set(committed.value.map((item) => item.productId)),
	];
	await purgeCatalogCache(ctx, changedProductIds);
	scheduleRestockDispatches(ctx, committed.value);
	ctx.log.info("order.updated", {
		orderId: input.id,
		total,
		order_status: input.status,
	});
	return Result.ok({ message: "Order updated successfully" });
};

export const patchOrderHeader = async (
	ctx: Context,
	input: patchOrderHeaderType,
) => {
	const order = await orderQueries.admin.getOrderById(input.id);
	if (!order) return Result.err(orderNotFound());
	const { id, customerPhone, ...rest } = input;
	await orderQueries.admin.patchOrderHeader(id, {
		...rest,
		...(customerPhone === undefined
			? {}
			: { customerPhone: Number(customerPhone) }),
	});
	ctx.log.info("order.header_patched", {
		orderId: id,
		fields: Object.keys(rest),
	});
	return Result.ok({ message: "Order header patched successfully" });
};

export const deleteOrder = async (ctx: Context, id: number) => {
	const committed = await db().transaction(async (tx) => {
		const order = await tx.query.OrdersTable.findFirst({
			where: and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)),
		});
		if (!order) return Result.err(orderNotFound());
		const details = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, id);
		const payment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(
			tx,
			id,
		);
		const deltas =
			payment?.status === "success"
				? details
						.filter((detail) => !detail.deletedAt)
						.map((detail) => ({
							productId: detail.productId,
							delta: detail.quantity,
						}))
				: [];
		const stockPlan = await lockAndValidateStock(tx, deltas, {
			requireActive: false,
			requireNonNegative: false,
		});
		if (stockPlan.status === "error") return stockPlan;
		const transitions = await applyLockedStockDeltas(tx, stockPlan.value, {
			requireActive: false,
			requireNonNegative: false,
		});
		await orderQueries.admin.softDeleteOrderTx(tx, id);
		return Result.ok(transitions);
	});
	if (committed.status === "error") return committed;
	await purgeCatalogCache(
		ctx,
		committed.value.map((item) => item.productId),
	);
	scheduleRestockDispatches(ctx, committed.value);
	ctx.log.warn("order.cancelled", { orderId: id });
	return Result.ok({ message: "Order deleted successfully" });
};

export const restoreOrder = async (ctx: Context, id: number) => {
	const committed = await db().transaction(async (tx) => {
		const order = await tx.query.OrdersTable.findFirst({
			where: and(eq(OrdersTable.id, id), isNull(OrdersTable.deletedAt)),
		});
		if (order)
			return Result.err(invalidOrderTransition(order.status, "pending"));
		const deletedOrder = await tx.query.OrdersTable.findFirst({
			where: eq(OrdersTable.id, id),
		});
		if (!deletedOrder) return Result.err(orderNotFound());
		const details = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, id);
		const payment = await tx.query.PaymentsTable.findFirst({
			where: eq(PaymentsTable.orderId, id),
			orderBy: desc(PaymentsTable.createdAt),
			columns: { status: true },
		});
		const deltas =
			payment?.status === "success"
				? details
						.filter((detail) => detail.deletedAt != null)
						.map((detail) => ({
							productId: detail.productId,
							delta: -detail.quantity,
						}))
				: [];
		const stockPlan = await lockAndValidateStock(tx, deltas, {
			requireActive: true,
			requireNonNegative: true,
		});
		if (stockPlan.status === "error") return stockPlan;
		const transitions = await applyLockedStockDeltas(tx, stockPlan.value, {
			requireActive: true,
			requireNonNegative: true,
		});
		await orderQueries.admin.restoreOrderTx(tx, id);
		return Result.ok(transitions);
	});
	if (committed.status === "error") return committed;
	await purgeCatalogCache(
		ctx,
		committed.value.map((item) => item.productId),
	);
	ctx.log.info("admin.action", {
		action: "restore_order",
		targetType: "order",
		targetId: id,
	});
	return Result.ok({ message: "Order restored successfully" });
};

export const updateOrderStatus = async (
	ctx: Context,
	input: {
		id: number;
		status: "pending" | "shipped" | "delivered" | "cancelled" | "refunded";
	},
) => {
	const order = await orderQueries.admin.getOrderById(input.id);
	if (!order) return Result.err(orderNotFound());
	await orderQueries.admin.updateOrderStatus(input.id, input.status);
	ctx.log.info("order.status_changed", {
		orderId: input.id,
		order_status: input.status,
	});
	return Result.ok({
		message: `Order status updated successfully to ${input.status}`,
	});
};

export const shipOrder = async (ctx: Context, orderId: number) => {
	const order = await orderQueries.admin.getOrderById(orderId);
	if (!order) return Result.err(orderNotFound());
	if (order.status !== "pending") {
		return Result.err(invalidOrderTransition(order.status, "shipped"));
	}
	let deliveryResult: Awaited<ReturnType<typeof createDelivery>>;
	try {
		deliveryResult = await createDelivery(
			order.id,
			order.orderNumber,
			String(order.customerPhone),
			order.addressZoneId ?? 15,
			order.address,
			order.notes,
		);
	} catch {
		return Result.err(deliverySubmissionFailed(true));
	}
	await orderQueries.admin.updateOrderStatus(order.id, "shipped", {
		deliveryProvider: "tu-delivery",
	});
	ctx.log.info("order.status_changed", {
		orderId: order.id,
		order_status: "shipped",
	});
	return Result.ok({
		orderId: order.id,
		orderNumber: order.orderNumber,
		documentNo: deliveryResult.documentNo,
		deliveryOrderId: deliveryResult.orderId,
	});
};

const batchFailure = (
	targetId: number,
	targetLabel: string,
	error: AdminOrderError,
): AdminBatchFailure => {
	const errorTag = match(
		error,
		"_tag",
	)<AdminBatchFailure["errorTag"]>({
		OrderNotFound: () => "OrderNotFound",
		InvalidOrderTransition: () => "InvalidOrderTransition",
		StockConflict: () => "StockConflict",
		DeliverySubmissionFailed: () => "DeliverySubmissionFailed",
		BatchPartiallyFailed: () => {
			throw new Error("Nested batch error is not a valid item failure");
		},
	});
	return { targetId, targetLabel, errorTag };
};

const shouldRetryDelivery = (error: AdminOrderError) =>
	match(
		error,
		"_tag",
	)<boolean>({
		OrderNotFound: () => false,
		InvalidOrderTransition: () => false,
		StockConflict: () => false,
		DeliverySubmissionFailed: ({ retryable }) => retryable,
		BatchPartiallyFailed: () => false,
	});

export const batchShipOrders = async (
	ctx: Context,
	orders: Array<{ id: number; orderNumber: string }>,
) => {
	const failures: AdminBatchFailure[] = [];
	for (const order of orders) {
		let outcome = await shipOrder(ctx, order.id);
		if (outcome.status === "error" && shouldRetryDelivery(outcome.error)) {
			outcome = await shipOrder(ctx, order.id);
		}
		if (outcome.status === "error") {
			failures.push(batchFailure(order.id, order.orderNumber, outcome.error));
		}
	}
	return aggregateBatchResult(orders.length, failures);
};

export const batchUpdateOrderStatus = async (
	ctx: Context,
	orders: Array<{ id: number; orderNumber: string }>,
	status: "pending" | "shipped" | "delivered" | "cancelled" | "refunded",
) => {
	const failures: AdminBatchFailure[] = [];
	for (const order of orders) {
		const outcome = await updateOrderStatus(ctx, { id: order.id, status });
		if (outcome.status === "error") {
			failures.push(batchFailure(order.id, order.orderNumber, outcome.error));
		}
	}
	return aggregateBatchResult(orders.length, failures);
};

export const adminOrderErrorToLegacyTrpc = (error: AdminOrderError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		OrderNotFound: () => ({ code: "NOT_FOUND", message: "Захиалга олдсонгүй" }),
		InvalidOrderTransition: () => ({
			code: "BAD_REQUEST",
			message: "Зөвхөн хүлээгдэж буй захиалгыг илгээх боломжтой",
		}),
		StockConflict: () => ({
			code: "CONFLICT",
			message: "Stock conflict",
		}),
		DeliverySubmissionFailed: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Захиалга илгээхэд алдаа гарлаа",
		}),
		BatchPartiallyFailed: () => ({
			code: "CONFLICT",
			message: "Batch partially failed",
		}),
	});
