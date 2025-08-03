import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { PaymentsTable } from "@/db/schema";
import { paymentProvider, paymentStatus } from "@/lib/constants";
import { adminProcedure, router } from "@/lib/trpc";

export const payment = router({
	createPayment: adminProcedure
		.input(
			z.object({
				orderId: z.number(),
				status: z.enum(paymentStatus).default("pending"),
				provider: z.enum(paymentProvider).default("transfer"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await ctx.db
					.insert(PaymentsTable)
					.values({
						orderId: input.orderId,
						provider: input.provider,
						status: input.status,
					})
					.returning({ id: PaymentsTable.id });
				return result[0];
			} catch (error) {
				console.error("Error creating payment:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create payment",
					cause: error,
				});
			}
		}),

	getPayments: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({
					id: PaymentsTable.id,
					orderId: PaymentsTable.orderId,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					createdAt: PaymentsTable.createdAt,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable)
				.orderBy(desc(PaymentsTable.createdAt));
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

	getPendingPayments: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({
					id: PaymentsTable.id,
					orderId: PaymentsTable.orderId,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					createdAt: PaymentsTable.createdAt,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable)
				.where(eq(PaymentsTable.status, "pending"))
				.orderBy(desc(PaymentsTable.createdAt));
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
