import { TRPCError } from "@trpc/server";
import { storeQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider } from "../../lib/constants";
import { sendTransferNotification } from "../../lib/integrations/messenger/messages";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";

export const payment = router({
	getPaymentByNumber: customerProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = storeQueries(ctx.db);
				const payment = await q.getPaymentInfoByNumber(input.paymentNumber);

				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				if (ctx.session.user.phone !== payment.order.customerPhone) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this payment",
					});
				}
				return {
					paymentNumber: payment.paymentNumber,
					status: payment.status,
					provider: payment.provider,
					createdAt: payment.createdAt,
					total: payment.order.total,
					order: {
						orderNumber: payment.order.orderNumber,
						status: payment.order.status,
						address: payment.order.address,
						notes: payment.order.notes,
						createdAt: payment.order.createdAt,
						products: payment.order.orderDetails.map((detail) => ({
							productId: detail.product.id,
							name: detail.product.name,
							price: detail.product.price,
							quantity: detail.quantity,
							imageUrl: detail.product.images[0]?.url,
						})),
					},
				};
			} catch (e) {
				if (e instanceof TRPCError) {
					throw e;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch payment",
					cause: e,
				});
			}
		}),
	confirmPayment: publicProcedure
		.input(
			v.object({
				paymentNumber: v.string(),
				provider: v.optional(v.picklist(paymentProvider)),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const q = storeQueries(ctx.db);
				await q.confirmPayment(input.paymentNumber, input.provider);
			} catch (e) {
				console.error(e);
			}
		}),
	sendTransferNotification: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const q = storeQueries(ctx.db);
				console.log(
					"sending transfer notification to messenger",
					input.paymentNumber,
				);
				const payment = await q.getPaymentByNumber(input.paymentNumber);
				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				console.log("payment", payment);
				await sendTransferNotification(payment.paymentNumber, payment.amount);
				return {
					orderNumber: payment.order.orderNumber,
				};
			} catch (e) {
				console.error(e);
			}
		}),
		getPaymentStatus: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const q = storeQueries(ctx.db);
				console.log("getting payment status", input.paymentNumber);
				const payment = await q.getPaymentByNumber(input.paymentNumber);
				console.log("payment", payment);
				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				return {
					status: payment.status,
					provider: payment.provider,
				};
			}
			catch (e) {
				console.error(e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get payment status",
					cause: e,
				});
			}
		}),
});
