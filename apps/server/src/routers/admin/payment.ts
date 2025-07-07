import { adminProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { PaymentsTable } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { paymentProvider, paymentStatus } from "@/lib/constants";

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
				throw new Error("Failed to create payment");
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
			return [];
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
			return [];
		}
	}),
});
