import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns, gte, isNull, sql } from "drizzle-orm";
import * as v from "valibot";
import { CustomersTable } from "../../db/schema";
import { adminProcedure, router } from "../../lib/trpc";
import { getDaysFromTimeRange } from "../../lib/utils";
import { timeRangeSchema } from "@vit/shared/schema";

export const customer = router({
	addUser: adminProcedure
		.input(
			v.object({
				phone: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(60000000),
					v.maxValue(99999999),
				),
				address: v.optional(v.string()),
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to add customer",
					cause: error,
				});
			}
		}),

	getCustomerByPhone: adminProcedure
		.input(
			v.object({
				phone: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(60000000),
					v.maxValue(99999999),
				),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				console.log("GETTING CUSTOMER BY PHONE");
				const result = await ctx.db
					.select(getTableColumns(CustomersTable))
					.from(CustomersTable)
					.where(
						and(
							eq(CustomersTable.phone, input.phone),
							isNull(CustomersTable.deletedAt),
						),
					)
					.limit(1);
				console.log("RESULT", result);
				if (result.length === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Customer not found",
					});
				}
				return result[0] || null;
			} catch (error) {
				console.error("Error getting customer by phone:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get customer by phone",
					cause: error,
				});
			}
		}),

	getCustomerCount: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db
				.select({
					count: sql<number>`COUNT(*)`,
				})
				.from(CustomersTable)
				.where(isNull(CustomersTable.deletedAt));
			return result[0]?.count || 0;
		} catch (error) {
			console.error("Error getting customer count:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get customer count",
				cause: error,
			});
		}
	}),

	getNewCustomersCount: adminProcedure
		.input(
			v.object({
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
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get new customers count",
					cause: error,
				});
			}
		}),

	getAllCustomers: adminProcedure.query(async ({ ctx }) => {
		try {
			const customers = await ctx.db
				.select(getTableColumns(CustomersTable))
				.from(CustomersTable)
				.where(isNull(CustomersTable.deletedAt))
				.orderBy(CustomersTable.createdAt);
			return customers;
		} catch (error) {
			console.error("Error getting all customers:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get all customers",
				cause: error,
			});
		}
	}),

	updateCustomer: adminProcedure
		.input(
			v.object({
				phone: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(60000000),
					v.maxValue(99999999),
				),
				address: v.optional(v.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { phone, address } = input;
				const result = await ctx.db
					.update(CustomersTable)
					.set({ address })
					.where(
						and(
							eq(CustomersTable.phone, phone),
							isNull(CustomersTable.deletedAt),
						),
					)
					.returning({ phone: CustomersTable.phone });

				if (result.length === 0) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Customer not found",
					});
				}
				return result[0] || null;
			} catch (error) {
				console.error("Error updating customer:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update customer",
					cause: error,
				});
			}
		}),

	deleteCustomer: adminProcedure
		.input(
			v.object({
				phone: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(60000000),
					v.maxValue(99999999),
				),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { phone } = input;
				await ctx.db
					.update(CustomersTable)
					.set({ deletedAt: new Date() })
					.where(
						and(
							eq(CustomersTable.phone, phone),
							isNull(CustomersTable.deletedAt),
						),
					);

				return { message: "Successfully deleted customer" };
			} catch (error) {
				console.error("Error deleting customer:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete customer",
					cause: error,
				});
			}
		}),
});
