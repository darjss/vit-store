import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider, paymentStatus } from "../../lib/constants";
import { adminProcedure, router } from "../../lib/trpc";
import { generatePaymentNumber } from "../../lib/utils";

export const payment = router({
	createPayment: adminProcedure
		.input(
			v.object({
				orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				status: v.picklist(paymentStatus),
				provider: v.picklist(paymentProvider),
				amount: v.pipe(v.number(), v.integer(), v.minValue(0)),
			}),
		)
		.mutation(async ({ input }) => {
			try {
				const result = await paymentQueries.admin.createPayment({
					paymentNumber: generatePaymentNumber(),
					orderId: input.orderId,
					provider: input.provider,
					status: input.status,
					amount: input.amount,
				});
				return result;
			} catch (error) {
				console.error("Error creating payment:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create payment",
					cause: error,
				});
			}
		}),

	getPayments: adminProcedure.query(async () => {
		try {
			const result = await paymentQueries.admin.getPayments();
			return result;
		} catch (error) {
			console.error("Error getting payments:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get payments",
				cause: error,
			});
		}
	}),

	getPendingPayments: adminProcedure.query(async () => {
		try {
			const result = await paymentQueries.admin.getPendingPayments();
			return result;
		} catch (error) {
			console.error("Error getting pending payments:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get pending payments",
				cause: error,
			});
		}
	}),
});
