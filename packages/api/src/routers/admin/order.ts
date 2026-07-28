import { TRPCError } from "@trpc/server";
import {
	addOrderSchema,
	patchOrderHeaderSchema,
	timeRangeSchema,
	updateOrderSchema,
} from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, paymentStatus } from "~/lib/constants";
import type { Context } from "~/lib/context";
import { getDeliveryAddressZones } from "~/lib/integrations/delivery";
import {
	adminProcedure,
	type baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addOrder,
	adminOrderBatchResultSchemas,
	adminOrderErrorToLegacyTrpc,
	adminOrderMutationResultSchemas,
	adminShipOrderResultSchemas,
	batchShipOrders,
	batchUpdateOrderStatus,
	deleteOrder,
	patchOrderHeader,
	restoreOrder,
	shipOrder,
	updateOrder,
	updateOrderStatus,
} from "~/operations/admin-order";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { orderQueries } from "~/queries/orders";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const runRead = async <Value>(
	ctx: Context,
	event: string,
	message: string,
	read: () => Promise<Value>,
) => {
	try {
		return await read();
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
			event,
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message,
			cause: error,
		});
	}
};

const orderIdInputSchema = v.object({ id: v.number() });
const shipOrderInputSchema = v.object({ orderId: v.number() });
const orderStatusInputSchema = v.object({
	id: v.number(),
	status: v.picklist([
		"pending",
		"shipped",
		"delivered",
		"cancelled",
		"refunded",
	]),
});
const batchOrdersInputSchema = v.object({
	orders: v.pipe(
		v.array(
			v.strictObject({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
				orderNumber: v.string(),
			}),
		),
		v.minLength(1),
	),
});
const batchStatusInputSchema = v.object({
	...batchOrdersInputSchema.entries,
	status: orderStatusInputSchema.entries.status,
});

export function buildOrderRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		addOrder: proc
			.input(addOrderSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_add_failed",
					"Failed to add order",
					() => addOrder(ctx, input),
					adminOrderErrorToLegacyTrpc,
				),
			),
		updateOrder: proc
			.input(updateOrderSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_update_failed",
					"Failed to update order",
					() => updateOrder(ctx, input),
					adminOrderErrorToLegacyTrpc,
				),
			),
		patchOrderHeader: proc
			.input(patchOrderHeaderSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_header_patch_failed",
					"Failed to patch order header",
					() => patchOrderHeader(ctx, input),
					adminOrderErrorToLegacyTrpc,
				),
			),
		deleteOrder: proc
			.input(orderIdInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_delete_failed",
					"Failed to delete order",
					() => deleteOrder(ctx, input.id),
					adminOrderErrorToLegacyTrpc,
				),
			),
		restoreOrder: proc
			.input(orderIdInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_restore_failed",
					"Failed to restore order",
					() => restoreOrder(ctx, input.id),
					adminOrderErrorToLegacyTrpc,
				),
			),
		searchOrder: proc
			.input(v.object({ searchTerm: v.string() }))
			.mutation(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.order_search_failed",
					"Failed to search order",
					() => orderQueries.admin.searchOrder(input.searchTerm),
				),
			),
		searchOrderQuick: proc
			.input(
				v.object({
					query: v.pipe(v.string(), v.minLength(1)),
					limit: v.optional(v.number(), 5),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.order_search_quick_failed",
					"Failed to search order quick",
					() => orderQueries.admin.searchOrdersQuick(input.query, input.limit),
				),
			),
		getAllOrders: proc.query(({ ctx }) =>
			runRead(ctx, "admin.orders_fetch_failed", "Failed to fetch orders", () =>
				orderQueries.admin.getAllOrders(),
			),
		),
		getOrderById: proc.input(orderIdInputSchema).query(({ ctx, input }) =>
			runRead(
				ctx,
				"admin.order_fetch_failed",
				"Failed to fetch order",
				async () => {
					const order = await orderQueries.admin.getOrderById(input.id);
					if (!order) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Order not found",
						});
					}
					return order;
				},
			),
		),
		getOrderIdByOrderNumber: proc
			.input(v.object({ orderNumber: v.pipe(v.string(), v.minLength(1)) }))
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.order_number_lookup_failed",
					"Failed to resolve order number",
					async () =>
						(await orderQueries.store.getOrderByOrderNumber(input.orderNumber))
							?.id ?? null,
				),
			),
		getPaginatedOrders: proc
			.input(
				v.object({
					page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
					pageSize: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(1)),
						PRODUCT_PER_PAGE,
					),
					paymentStatus: v.optional(v.picklist(paymentStatus)),
					includeAllStatuses: v.optional(v.boolean()),
					orderStatus: v.optional(
						v.picklist([
							"created",
							"pending",
							"shipped",
							"delivered",
							"cancelled",
							"refunded",
						]),
					),
					orderStatuses: v.optional(
						v.array(
							v.picklist([
								"created",
								"pending",
								"shipped",
								"delivered",
								"cancelled",
								"refunded",
							]),
						),
					),
					sortField: v.optional(v.string()),
					sortDirection: v.optional(v.picklist(["asc", "desc"])),
					searchTerm: v.optional(v.string()),
					date: v.optional(v.string()),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.orders_paginated_fetch_failed",
					"Failed to fetch paginated orders",
					() =>
						orderQueries.admin.getPaginatedOrders({
							page: input.page ?? 1,
							pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
							paymentStatus: input.paymentStatus,
							includeAllStatuses: input.includeAllStatuses,
							orderStatus: input.orderStatus,
							orderStatuses: input.orderStatuses,
							sortField: input.sortField,
							sortDirection: input.sortDirection,
							searchTerm: input.searchTerm,
							date: input.date,
						}),
				),
			),
		getOrderCount: proc
			.input(v.object({ timeRange: timeRangeSchema }))
			.query(({ input }) => orderQueries.admin.getOrderCount(input.timeRange)),
		getPendingOrders: proc.query(() => orderQueries.admin.getPendingOrders()),
		updateOrderStatus: proc
			.input(orderStatusInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.order_status_update_failed",
					"Failed to update order status",
					() => updateOrderStatus(ctx, input),
					adminOrderErrorToLegacyTrpc,
				),
			),
		getRecentOrdersByProductId: proc
			.input(v.object({ productId: v.number() }))
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.recent_orders_fetch_failed",
					"Failed to fetch recent orders",
					() => orderQueries.admin.getRecentOrdersByProductId(input.productId),
				),
			),
		shipOrder: proc
			.input(shipOrderInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.ship_order_failed",
					"Захиалга илгээхэд алдаа гарлаа",
					() => shipOrder(ctx, input.orderId),
					adminOrderErrorToLegacyTrpc,
				),
			),
		getDeliveryAddressZones: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"order.fetch_zones_failed",
				"Failed to fetch delivery zones",
				getDeliveryAddressZones,
			),
		),
	});
}

export const orderV2 = router({
	addOrder: adminProcedure
		.input(addOrderSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addOrder(ctx, input),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.add", error_layer: "domain" },
			),
		),
	updateOrder: adminProcedure
		.input(updateOrderSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateOrder(ctx, input),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.update", error_layer: "domain" },
			),
		),
	patchOrderHeader: adminProcedure
		.input(patchOrderHeaderSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await patchOrderHeader(ctx, input),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.patch_header", error_layer: "domain" },
			),
		),
	deleteOrder: adminProcedure
		.input(orderIdInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteOrder(ctx, input.id),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.delete", error_layer: "domain" },
			),
		),
	restoreOrder: adminProcedure
		.input(orderIdInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await restoreOrder(ctx, input.id),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.restore", error_layer: "domain" },
			),
		),
	updateOrderStatus: adminProcedure
		.input(orderStatusInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateOrderStatus(ctx, input),
				adminOrderMutationResultSchemas,
				{ operation: "admin.order.update_status", error_layer: "domain" },
			),
		),
	shipOrder: adminProcedure
		.input(shipOrderInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await shipOrder(ctx, input.orderId),
				adminShipOrderResultSchemas,
				{ operation: "admin.order.ship", error_layer: "provider" },
			),
		),
	batchShipOrders: adminProcedure
		.input(batchOrdersInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await batchShipOrders(ctx, input.orders),
				adminOrderBatchResultSchemas,
				{ operation: "admin.order.batch_ship", error_layer: "domain" },
			),
		),
	batchUpdateOrderStatus: adminProcedure
		.input(batchStatusInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await batchUpdateOrderStatus(ctx, input.orders, input.status),
				adminOrderBatchResultSchemas,
				{ operation: "admin.order.batch_status", error_layer: "domain" },
			),
		),
});

export const order = buildOrderRouter(adminProcedure);
export const orderBot = buildOrderRouter(botProcedure);
