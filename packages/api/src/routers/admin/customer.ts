import { TRPCError } from "@trpc/server";
import { customerQueries } from "@vit/api/queries";
import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { getDaysFromTimeRange } from "~/lib/utils";
export function buildCustomerRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addUser: proc
			.input(
				v.object({
					address: v.optional(v.string()),
					addressZoneId: v.optional(v.number()),
					phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const result = await customerQueries.admin.createCustomer(input);
					return result;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "addUser",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to add customer",
					});
				}
			}),
		deleteCustomer: proc
			.input(
				v.object({
					phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const { phone } = input;
					await customerQueries.admin.deleteCustomer(phone);
					return { message: "Successfully deleted customer" };
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "deleteCustomer",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to delete customer",
					});
				}
			}),
		getAllCustomers: proc.query(async ({ ctx }) => {
			try {
				const customers = await customerQueries.admin.getAllCustomers();
				return customers;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getAllCustomers",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get all customers",
				});
			}
		}),
		getCustomerByPhone: proc
			.input(
				v.object({
					phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const result = await customerQueries.admin.getCustomerByPhone(input.phone);
					if (!result) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Customer not found",
						});
					}
					return result;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getCustomerByPhone",
					});
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to get customer by phone",
					});
				}
			}),
		getCustomerCount: proc.query(async ({ ctx }) => {
			try {
				const count = await customerQueries.admin.getCustomerCount();
				return count;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getCustomerCount",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get customer count",
				});
			}
		}),
		getNewCustomersCount: proc
			.input(
				v.object({
					timeRange: timeRangeSchema,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const { timeRange } = input;
					const startDate = await getDaysFromTimeRange(timeRange);
					const count = await customerQueries.admin.getNewCustomersCount(startDate);
					return count;
				} catch (error) {
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "getNewCustomersCount",
					});
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to get new customers count",
					});
				}
			}),
		updateCustomer: proc
			.input(
				v.object({
					address: v.optional(v.string()),
					phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const { address, phone } = input;
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
					ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
						event: "updateCustomer",
					});
					if (error instanceof TRPCError) {
						throw error;
					}
					throw new TRPCError({
						cause: error,
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to update customer",
					});
				}
			}),
	});
}
export const customer = buildCustomerRouter(adminProcedure);
export const customerBot = buildCustomerRouter(botProcedure);
