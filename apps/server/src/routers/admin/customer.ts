import { adminProcedure, router } from "@/lib/trpc";
import { z } from "zod";
import { CustomersTable } from "@/db/schema";
import { eq, getTableColumns, gte, sql } from "drizzle-orm";
import { timeRangeSchema } from "@/lib/zod/schema";
import { getDaysFromTimeRange } from "@/lib/utils";

export const customer = router({
	addUser: adminProcedure
		.input(
			z.object({
				phone: z.number(),
				address: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await ctx.db
					.insert(CustomersTable)
					.values(input)
					.returning({ phone: CustomersTable.phone });
				return result;
			} catch (error) {
				console.error("Error adding customer:", error);
				throw new Error("Failed to add customer");
			}
		}),

	getCustomerByPhone: adminProcedure
		.input(
			z.object({
				phone: z.number(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				console.log("GETTING CUSTOMER BY PHONE");
				const result = await ctx.db
					.select(getTableColumns(CustomersTable))
					.from(CustomersTable)
					.where(eq(CustomersTable.phone, input.phone))
					.limit(1);
				console.log("RESULT", result);
				return result[0] || null;
			} catch (error) {
				console.error("Error getting customer by phone:", error);
				return null;
			}
		}),

	getCustomerCount: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({
					count: sql<number>`COUNT(*)`,
				})
				.from(CustomersTable);
			return result[0]?.count || 0;
		} catch (error) {
			console.error("Error getting customer count:", error);
			return 0;
		}
	}),

	getNewCustomersCount: adminProcedure
		.input(
			z.object({
				timeRange: timeRangeSchema,
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { timeRange } = input;
				const startDate = await getDaysFromTimeRange(timeRange);

				const result = await ctx.db
					.select({
						count: sql<number>`COUNT(*)`,
					})
					.from(CustomersTable)
					.where(gte(CustomersTable.createdAt, startDate))
					.get();

				return result?.count ?? 0;
			} catch (error) {
				console.error("Error getting new customers count:", error);
				return 0;
			}
		}),

	getAllCustomers: adminProcedure.query(async ({ ctx }) => {
		try {
			const customers = await ctx.db
				.select(getTableColumns(CustomersTable))
				.from(CustomersTable)
				.orderBy(CustomersTable.createdAt);
			return customers;
		} catch (error) {
			console.error("Error getting all customers:", error);
			return [];
		}
	}),

	updateCustomer: adminProcedure
		.input(
			z.object({
				phone: z.number(),
				address: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { phone, address } = input;
				const result = await ctx.db
					.update(CustomersTable)
					.set({ address })
					.where(eq(CustomersTable.phone, phone))
					.returning({ phone: CustomersTable.phone });

				return result[0] || null;
			} catch (error) {
				console.error("Error updating customer:", error);
				throw new Error("Failed to update customer");
			}
		}),

	deleteCustomer: adminProcedure
		.input(
			z.object({
				phone: z.number(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { phone } = input;
				await ctx.db
					.delete(CustomersTable)
					.where(eq(CustomersTable.phone, phone));

				return { message: "Successfully deleted customer" };
			} catch (error) {
				console.error("Error deleting customer:", error);
				throw new Error("Failed to delete customer");
			}
		}),
});
