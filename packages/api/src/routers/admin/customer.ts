import { TRPCError } from "@trpc/server";
import { customerQueries } from "@vit/api/queries";
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
		.mutation(async ({ input }) => {
			try {
				const result = await customerQueries.admin.createCustomer(input);
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
		.query(async ({ input }) => {
			try {
				console.log("GETTING CUSTOMER BY PHONE");
				const result = await customerQueries.admin.getCustomerByPhone(
					input.phone,
				);
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

	getCustomerCount: adminProcedure.query(async () => {
		try {
			const count = await customerQueries.admin.getCustomerCount();
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
		.query(async ({ input }) => {
			try {
				const { timeRange } = input;
				const startDate = await getDaysFromTimeRange(timeRange);
				const count =
					await customerQueries.admin.getNewCustomersCount(startDate);
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

	getAllCustomers: adminProcedure.query(async () => {
		try {
			const customers = await customerQueries.admin.getAllCustomers();
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
		.mutation(async ({ input }) => {
			try {
				const { phone, address } = input;
				const result = await customerQueries.admin.updateCustomer(phone, {
					address,
				});
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
		.mutation(async ({ input }) => {
			try {
				const { phone } = input;
				await customerQueries.admin.deleteCustomer(phone);
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
