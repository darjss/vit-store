import { TRPCError } from "@trpc/server";
import { createQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminProcedure, router } from "../../lib/trpc";
import { getDaysFromTimeRange } from "../../lib/utils";

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
				const q = createQueries(ctx.db).customers.admin;
				const result = await q.createCustomer(input);
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
				const q = createQueries(ctx.db).customers.admin;
				console.log("GETTING CUSTOMER BY PHONE");
				const result = await q.getCustomerByPhone(input.phone);
				console.log("RESULT", result);
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Customer not found",
					});
				}
				return result;
			} catch (error) {
				console.error("Error getting customer by phone:", error);
				if (error instanceof TRPCError) throw error;
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get customer by phone",
					cause: error,
				});
			}
		}),

	getCustomerCount: adminProcedure.query(async ({ ctx }) => {
		try {
			const q = createQueries(ctx.db).customers.admin;
			const count = await q.getCustomerCount();
			return count;
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
				const q = createQueries(ctx.db).customers.admin;
				const { timeRange } = input;
				const startDate = await getDaysFromTimeRange(timeRange);
				const count = await q.getNewCustomersCount(startDate);
				return count;
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
			const q = createQueries(ctx.db).customers.admin;
			const customers = await q.getAllCustomers();
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
				const q = createQueries(ctx.db).customers.admin;
				const { phone, address } = input;
				const result = await q.updateCustomer(phone, { address });
				if (!result) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Customer not found",
					});
				}
				return result;
			} catch (error) {
				console.error("Error updating customer:", error);
				if (error instanceof TRPCError) throw error;
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
				const q = createQueries(ctx.db).customers.admin;
				const { phone } = input;
				await q.deleteCustomer(phone);
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
