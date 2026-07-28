import { TRPCError } from "@trpc/server";
import { timeRangeSchema } from "@vit/shared";
import * as v from "valibot";
import { getDaysFromTimeRange } from "~/lib/utils";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addCustomer,
	catalogErrorToLegacyTrpc,
	catalogMutationResultSchemas,
	customerCreatedResultSchemas,
	customerLookupResultSchemas,
	customerUpdatedResultSchemas,
	deleteCustomer,
	getCustomerByPhone,
	updateCustomer,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { customerQueries } from "~/queries/customers";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const phoneSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(60000000),
	v.maxValue(99999999),
);
const customerPhoneInputSchema = v.object({ phone: phoneSchema });
const addCustomerInputSchema = v.object({
	phone: phoneSchema,
	address: v.optional(v.string()),
	addressZoneId: v.optional(v.number()),
});
const updateCustomerInputSchema = v.object({
	phone: phoneSchema,
	address: v.optional(v.string()),
});

export function buildCustomerRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addUser: proc
			.input(addCustomerInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addUser",
					"Failed to add customer",
					() => addCustomer(input),
					catalogErrorToLegacyTrpc,
				),
			),
		getCustomerByPhone: proc
			.input(customerPhoneInputSchema)
			.query(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"getCustomerByPhone",
					"Failed to get customer by phone",
					() => getCustomerByPhone(input.phone),
					catalogErrorToLegacyTrpc,
				),
			),
		getCustomerCount: proc.query(async ({ ctx }) => {
			try {
				return await customerQueries.admin.getCustomerCount();
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getCustomerCount",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get customer count",
					cause: error,
				});
			}
		}),
		getNewCustomersCount: proc
			.input(v.object({ timeRange: timeRangeSchema }))
			.query(async ({ ctx, input }) => {
				try {
					return await customerQueries.admin.getNewCustomersCount(
						await getDaysFromTimeRange(input.timeRange),
					);
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "getNewCustomersCount" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to get new customers count",
						cause: error,
					});
				}
			}),
		getAllCustomers: proc.query(async ({ ctx }) => {
			try {
				return await customerQueries.admin.getAllCustomers();
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getAllCustomers",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get all customers",
					cause: error,
				});
			}
		}),
		updateCustomer: proc
			.input(updateCustomerInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateCustomer",
					"Failed to update customer",
					() => updateCustomer(input),
					catalogErrorToLegacyTrpc,
				),
			),
		deleteCustomer: proc
			.input(customerPhoneInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deleteCustomer",
					"Failed to delete customer",
					() => deleteCustomer(input.phone),
					catalogErrorToLegacyTrpc,
				),
			),
	});
}

export const customerV2 = router({
	addUser: adminProcedure
		.input(addCustomerInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addCustomer(input),
				customerCreatedResultSchemas,
				{ operation: "admin.customer.add", error_layer: "domain" },
			),
		),
	getCustomerByPhone: adminProcedure
		.input(customerPhoneInputSchema)
		.query(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await getCustomerByPhone(input.phone),
				customerLookupResultSchemas,
				{ operation: "admin.customer.lookup", error_layer: "domain" },
			),
		),
	updateCustomer: adminProcedure
		.input(updateCustomerInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateCustomer(input),
				customerUpdatedResultSchemas,
				{ operation: "admin.customer.update", error_layer: "domain" },
			),
		),
	deleteCustomer: adminProcedure
		.input(customerPhoneInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteCustomer(input.phone),
				catalogMutationResultSchemas,
				{ operation: "admin.customer.delete", error_layer: "domain" },
			),
		),
});

export const customer = buildCustomerRouter(adminProcedure);
export const customerBot = buildCustomerRouter(botProcedure);
