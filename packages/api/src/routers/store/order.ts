import { TRPCError } from "@trpc/server";
import { createQueries } from "@vit/api/queries";
import * as v from "valibot";
import { newOrderSchema } from "../../../../shared/src";
import { createSession, setSessionTokenCookie } from "../../lib/session/store";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "../../lib/utils";
import { addCustomerToDB } from "./auth";

export const order = router({
	getOrdersByCustomerId: customerProcedure.query(async ({ ctx }) => {
		try {
			const q = createQueries(ctx.db).orders.store;
			const customerPhone = ctx.session.user.phone;
			const orders = await q.getOrdersByCustomerPhone(customerPhone);
			return orders.map((order) => {
				const { orderDetails, sales, ...orderInfo } = order;

				const salesPriceMap = new Map<number, number>();
				sales.forEach((sale) => {
					salesPriceMap.set(sale.productId, sale.sellingPrice);
				});
				const products = orderDetails.map((detail) => ({
					name: detail.product.name,
					brandName: detail.product.brand.name,
					imageUrl: detail.product.images[0]?.url,
					quantity: detail.quantity,
					sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
				}));
				return {
					...orderInfo,
					products,
				};
			});
		} catch (e) {
			console.error(e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
				cause: e,
			});
		}
	}),
	addOrder: publicProcedure
		.input(newOrderSchema)
		.mutation(async ({ input, ctx }) => {
			try {
				const start = performance.now();
				const queries = createQueries(ctx.db);
				const storeOrderQ = queries.orders.store;
				const storeCustomerQ = queries.customers.store;
				const adminPaymentQ = queries.payments.admin;
				const products = await storeOrderQ.getProductsByIds(
					input.products.map((p) => p.productId),
				);
				const total = products.reduce((acc, p) => {
					const quantity = input.products.find(
						(p2) => p2.productId === p.id,
					)?.quantity;
					if (quantity) {
						return acc + p.price * quantity;
					}
					return acc;
				}, 0);
				const customer = await storeCustomerQ.getCustomerByPhone(
					Number(input.phoneNumber),
				);
				if (!customer) {
					await storeCustomerQ.createCustomer({
						phone: Number(input.phoneNumber),
						address: input.address,
					});
				}
				await storeCustomerQ.updateCustomerAddress(
					Number(input.phoneNumber),
					input.address,
				);
				const order = await storeOrderQ.createOrder({
					orderNumber: generateOrderNumber(),
					customerPhone: Number(input.phoneNumber),
					address: input.address,
					notes: input.notes ?? null,
					total: total,
					status: "pending",
					deliveryProvider: "tu-delivery",
				});
				const orderId = order?.orderId;
				if (!orderId) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create order",
					});
				}
				await storeOrderQ.createOrderDetails(
					orderId,
					input.products.map((p) => ({
						productId: p.productId,
						quantity: p.quantity,
					})),
				);
				console.log("order created", orderId);
				let paymentNumber: string | null = null;
				try {
					const paymentResult = await adminPaymentQ.createPayment({
						paymentNumber: generatePaymentNumber(),
						orderId: orderId,
						provider: "transfer",
						status: "pending",
						amount: total,
					});
					paymentNumber = paymentResult?.paymentNumber ?? null;
				} catch (e) {
					console.error(e);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: e,
					});
				}

				const user = await addCustomerToDB(input.phoneNumber, ctx.db);

				if (!user) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create or retrieve user",
					});
				}

				const { session, token } = await createSession(user, ctx.kv);

				setSessionTokenCookie(ctx.c, token, session.expiresAt);
				const end = performance.now();
				console.log(
					"time taken to add customer to db and create session",
					end - start,
				);
				return { paymentNumber };
			} catch (e) {
				console.error(e);
			}
		}),
	getOrderByOrderNumber: customerProcedure
		.input(v.object({ orderNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = createQueries(ctx.db).orders.store;
				const order = await q.getOrderByOrderNumber(input.orderNumber);
				return order;
			} catch (e) {
				console.error(e);
			}
		}),
});
