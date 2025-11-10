import { TRPCError } from "@trpc/server";
import { storeQueries,adminQueries } from "@vit/api/queries";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import * as v from "valibot";
import { paymentProvider } from "../../lib/constants";
import { sendTransferNotification } from "../../lib/integrations/messenger/messages";

export const payment = router({
	getPaymentByNumber: customerProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const payment = await storeQueries.getPaymentInfoByNumber(
					input.paymentNumber,
				);

				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				if(ctx.session.user.phone !== payment.order.customerPhone) {
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
		.input(v.object({ paymentNumber: v.string(), provider: v.optional(v.picklist(paymentProvider)) }))
		.mutation(async ({ ctx, input }) => {
			try {
				await storeQueries.confirmPayment(input.paymentNumber, input.provider);
			} catch (e) {
				console.error(e);
			}
		}),
		sendTransferNotification: publicProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				console.log("sending transfer notification to messenger", input.paymentNumber);
				const payment = await storeQueries.getPaymentByNumber(input.paymentNumber);
				if (!payment) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Payment not found",
					});
				}
				console.log("payment", payment);
				await sendTransferNotification(payment.paymentNumber, payment.amount);
			} catch (e) {
				console.error(e);
			}
		}),
});
