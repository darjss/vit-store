import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { customerQueries, orderQueries, paymentQueries, productQueries, salesQueries, } from "@vit/api/queries";
import { addOrderSchema, patchOrderHeaderSchema, timeRangeSchema, updateOrderSchema, } from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, paymentStatus } from "~/lib/constants";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { createDelivery, getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { planPaymentTransition } from "./order-transition";
import { db } from "~/db/client";
import { SalesTable, } from "~/db/schema";
import { getAverageCostOfProduct } from "~/queries/payments";
import { applyStockTransition, type StockTransition } from "~/lib/stock/transition";
import { scheduleRestockDispatches } from "~/lib/restock";

// Factory: the order router is identical for every caller — only the procedure
// wrapper (admin session auth vs bot token auth) differs. Resolver bodies stay
// exactly as-is; `proc` is the only thing that varies.
export function buildOrderRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    addOrder: proc
        .input(addOrderSchema)
        .mutation(async ({ input, ctx }) => {
        try {
            const orderTotal = input.products.reduce((acc, currentProduct) => acc + currentProduct.price * currentProduct.quantity, 0);
            // Customer create/update stays outside the order transaction: it is
            // idempotent and not order-critical. The order insert, order-details
            // insert, sales rows, stock deductions, and payment insert are all
            // atomic so a payment-create failure (or any other failure) rolls
            // back the whole order — no orphaned order with deducted stock and
            // recorded sales but no payment row.
            if (input.isNewCustomer) {
                const existingCustomer = await customerQueries.admin.getCustomerByPhone(Number(input.customerPhone));
                if (!existingCustomer) {
                    await customerQueries.admin.createCustomer({
                        phone: Number(input.customerPhone),
                        address: input.address,
                    });
                }
                else if (input.address && input.address !== existingCustomer.address) {
                    await customerQueries.admin.updateCustomer(Number(input.customerPhone), { address: input.address });
                }
            }
            const orderNumber = generateOrderNumber();
            const paymentNumber = generatePaymentNumber();
            const orderDetails = input.products.map((product) => ({
                productId: product.productId,
                quantity: product.quantity,
                price: product.price,
            }));
            const { orderId } = await db().transaction(async (tx) => {
                const order = await orderQueries.admin.createOrderTx(tx, {
                    orderNumber: orderNumber,
                    customerPhone: Number(input.customerPhone),
                    status: input.status,
                    notes: input.notes ?? null,
                    total: orderTotal,
                    address: input.address,
                    deliveryProvider: input.deliveryProvider,
                });
                const orderId = order?.orderId;
                await orderQueries.admin.createOrderDetailsTx(tx, orderId, orderDetails);
                if (input.paymentStatus === "success") {
                    for (const product of input.products) {
                        const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
                        await salesQueries.admin.addSaleTx(tx, {
                            productCost: productCost,
                            quantitySold: product.quantity,
                            orderId: orderId,
                            sellingPrice: product.price,
                            productId: product.productId,
                        });
                        await productQueries.admin.updateStockTx(tx, product.productId, product.quantity, "minus");
                    }
                }
                await paymentQueries.admin.createPaymentTx(tx, {
                    paymentNumber,
                    orderId: orderId,
                    provider: "transfer",
                    status: input.paymentStatus,
                    amount: orderTotal,
                });
                return { orderId };
            });
            ctx.log.info("payment.created", {
                paymentNumber,
                orderId,
                amount: orderTotal,
                provider: "transfer",
                payment_status: input.paymentStatus,
            });
            ctx.log.info("order.created", {
                orderId,
                orderNumber,
                customerPhone: Number(input.customerPhone),
                total: orderTotal,
                itemCount: input.products.length,
                order_status: input.status,
            });
            return { message: "Order added successfully" };
        }
        catch (e) {
            if (e instanceof TRPCError)
                throw e;
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_add_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to add order",
                cause: e,
            });
        }
    }),
    updateOrder: proc
        .input(updateOrderSchema)
        .mutation(async ({ input, ctx }) => {
        try {
            const orderTotal = input.products.reduce((acc, currentProduct) => acc + currentProduct.price * currentProduct.quantity, 0);
            if (input.isNewCustomer) {
                const existingCustomer = await customerQueries.admin.getCustomerByPhone(Number(input.customerPhone));
                if (!existingCustomer) {
                    await customerQueries.admin.createCustomer({
                        phone: Number(input.customerPhone),
                        address: input.address,
                    });
                }
                else {
                    await customerQueries.admin.updateCustomer(Number(input.customerPhone), { address: input.address });
                }
            }
            // Critical section: order header update, order-detail replacement,
            // prev-status read, sales insert, stock changes, and payment
            // update in one transaction so a rollback can't leave the header
            // or lines updated while sales/stock/payment stay untouched, and
            // concurrent saves can't both observe prev=pending and double-book.
            //
            // Invariant: each order line's stock is deducted EXACTLY ONCE,
            // when payment transitions to success. This matches addOrder
            // (deducts on creation with paymentStatus==="success") and
            // confirmPaymentAndApplyStock (deducts on transition to success).
            // Pending orders never touch stock.
            const restockCandidates = await db().transaction(async (tx) => {
                const stockTransitions: StockTransition[] = [];
                await orderQueries.admin.updateOrderTx(tx, input.id, {
                    customerPhone: Number(input.customerPhone),
                    status: input.status,
                    notes: input.notes,
                    total: orderTotal,
                    address: input.address,
                    addressZoneId: input.addressZoneId ?? null,
                    deliveryProvider: input.deliveryProvider,
                });
                const currentOrderDetails = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, input.id);
                await orderQueries.admin.deleteOrderDetailsTx(tx, input.id);
                await orderQueries.admin.createOrderDetailsTx(tx, input.id, input.products.map((product) => ({
                    productId: product.productId,
                    quantity: product.quantity,
                    price: product.price,
                })));
                const prevPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(tx, input.id);
                const prevPaymentStatus = prevPayment?.status ?? "pending";
                const { transitionedToSuccess } = planPaymentTransition(prevPaymentStatus, input.paymentStatus);
                const wasSuccess = prevPaymentStatus === "success";
                for (const product of input.products) {
                    const existingDetail = currentOrderDetails.find((detail) => detail.productId === product.productId);
                    if (transitionedToSuccess) {
                        const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
                        await tx.insert(SalesTable).values({
                            productCost: productCost,
                            quantitySold: product.quantity,
                            orderId: input.id,
                            sellingPrice: product.price,
                            productId: product.productId,
                        });
                        const transition = await applyStockTransition(tx, { productId: product.productId, delta: -product.quantity });
                        if (transition)
                            stockTransitions.push(transition);
                    }
                    else if (wasSuccess) {
                        if (existingDetail) {
                            const quantityDiff = product.quantity - existingDetail.quantity;
                            if (quantityDiff !== 0) {
                                const transition = await applyStockTransition(tx, { productId: product.productId, delta: -quantityDiff });
                                if (transition)
                                    stockTransitions.push(transition);
                            }
                        }
                        else {
                            const transition = await applyStockTransition(tx, { productId: product.productId, delta: -product.quantity });
                            if (transition)
                                stockTransitions.push(transition);
                        }
                    }
                    // else: pending/other — no stock changes (deducted on transition)
                }
                if (wasSuccess && !transitionedToSuccess) {
                    const removedProducts = currentOrderDetails.filter((detail) => !input.products.some((p) => p.productId === detail.productId));
                    for (const detail of removedProducts) {
                        const transition = await applyStockTransition(tx, { productId: detail.productId, delta: detail.quantity });
                        if (transition)
                            stockTransitions.push(transition);
                    }
                    // Sync SalesTable to the edited order details so dashboard
                    // revenue/profit analytics match reality. Previously paid-
                    // order edits adjusted stock but left SalesTable stale
                    // (wrong quantitySold/sellingPrice, missing rows for added
                    // lines, phantom rows for removed lines). Soft-delete all
                    // existing sales for this order and re-insert from the
                    // current product list — same delete+recreate pattern used
                    // for order details above.
                    await tx
                        .update(SalesTable)
                        .set({ deletedAt: new Date() })
                        .where(eq(SalesTable.orderId, input.id));
                    for (const product of input.products) {
                        const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
                        await tx.insert(SalesTable).values({
                            productCost: productCost,
                            quantitySold: product.quantity,
                            orderId: input.id,
                            sellingPrice: product.price,
                            productId: product.productId,
                        });
                    }
                }
                await paymentQueries.admin.updatePaymentStatusTx(tx, input.id, input.paymentStatus);
                ctx.log.info("order.updated", {
                    orderId: input.id,
                    total: orderTotal,
                    order_status: input.status,
                    payment_transitioned: transitionedToSuccess,
                });
                return stockTransitions;
            });
            scheduleRestockDispatches(ctx, restockCandidates);
            return { message: "Order updated successfully" };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_update_failed",
                orderId: input.id
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update order",
                cause: e,
            });
        }
    }),
    patchOrderHeader: proc
        .input(patchOrderHeaderSchema)
        .mutation(async ({ input, ctx }) => {
        try {
            const { id, customerPhone, ...rest } = input;
            const patch: {
                customerPhone?: number;
                address?: string;
                addressZoneId?: number | null;
                notes?: string | null;
                status?: typeof rest.status;
                deliveryProvider?: typeof rest.deliveryProvider;
            } = { ...rest };
            if (customerPhone !== undefined) {
                patch.customerPhone = Number(customerPhone);
            }
            await orderQueries.admin.patchOrderHeader(id, patch);
            ctx.log.info("order.header_patched", {
                orderId: id,
                fields: Object.keys(rest),
            });
            return { message: "Order header patched successfully" };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_header_patch_failed",
                orderId: input.id
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to patch order header",
                cause: e,
            });
        }
    }),
    deleteOrder: proc
        .input(v.object({ id: v.number() }))
        .mutation(async ({ input, ctx }) => {
        try {
            const restockCandidates = await db().transaction(async (tx) => {
                const stockTransitions: StockTransition[] = [];
                const orderDetails = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, input.id);
                const latestPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(tx, input.id);
                const stockWasDeducted = latestPayment?.status === "success";
                if (stockWasDeducted) {
                    for (const detail of orderDetails.filter((detail) => !detail.deletedAt)) {
                        const transition = await productQueries.admin.updateStockTx(tx, detail.productId, detail.quantity, "add");
                        if (transition)
                            stockTransitions.push(transition);
                    }
                }
                await orderQueries.admin.softDeleteOrderTx(tx, input.id);
                return stockTransitions;
            });
            scheduleRestockDispatches(ctx, restockCandidates);
            ctx.log.warn("order.cancelled", { orderId: input.id });
            return { message: "Order deleted successfully" };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_delete_failed",
                orderId: input.id
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to delete order",
                cause: e,
            });
        }
    }),
    restoreOrder: proc
        .input(v.object({ id: v.number() }))
        .mutation(async ({ input, ctx }) => {
        try {
            await db().transaction(async (tx) => {
                const details = await orderQueries.admin.getOrderDetailsByOrderIdTx(tx, input.id);
                const latestPayment = await paymentQueries.admin.getLatestPaymentByOrderIdTx(tx, input.id);
                const stockWasDeducted = latestPayment?.status === "success";
                if (stockWasDeducted) {
                    for (const d of details.filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)) {
                        await productQueries.admin.updateStockTx(tx, d.productId, d.quantity, "minus");
                    }
                }
                await orderQueries.admin.restoreOrderTx(tx, input.id);
            });
            ctx.log.info("admin.action", {
                action: "restore_order",
                targetType: "order",
                targetId: input.id,
            });
            return { message: "Order restored successfully" };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_restore_failed",
                orderId: input.id
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to restore order",
                cause: e,
            });
        }
    }),
    searchOrder: proc
        .input(v.object({ searchTerm: v.string() }))
        .mutation(async ({ input, ctx }) => {
        try {
            const orders = await orderQueries.admin.searchOrder(input.searchTerm);
            return orders;
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_search_failed",
                searchTerm: input.searchTerm
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to search order",
                cause: e,
            });
        }
    }),
    searchOrderQuick: proc
        .input(v.object({
        query: v.pipe(v.string(), v.minLength(1)),
        limit: v.optional(v.number(), 5),
    }))
        .query(async ({ input, ctx }) => {
        try {
            return await orderQueries.admin.searchOrdersQuick(input.query, input.limit);
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_search_quick_failed",
                query: input.query
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to search order quick",
                cause: e,
            });
        }
    }),
    getAllOrders: proc.query(async ({ ctx }) => {
        try {
            const orders = await orderQueries.admin.getAllOrders();
            return orders;
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.orders_fetch_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch orders",
                cause: e,
            });
        }
    }),
    getOrderById: proc
        .input(v.object({ id: v.number() }))
        .query(async ({ input, ctx }) => {
        try {
            const result = await orderQueries.admin.getOrderById(input.id);
            if (!result) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Order not found",
                });
            }
            return result;
        }
        catch (e) {
            if (e instanceof TRPCError)
                throw e;
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_fetch_failed",
                orderId: input.id
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch order",
                cause: e,
            });
        }
    }),
    getOrderIdByOrderNumber: proc
        .input(v.object({ orderNumber: v.pipe(v.string(), v.minLength(1)) }))
        .query(async ({ input, ctx }) => {
        try {
            const order = await orderQueries.store.getOrderByOrderNumber(input.orderNumber);
            return order?.id ?? null;
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_number_lookup_failed",
                orderNumber: input.orderNumber,
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to resolve order number",
                cause: e,
            });
        }
    }),
    getPaginatedOrders: proc
        .input(v.object({
        page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
        pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
        paymentStatus: v.optional(v.picklist(paymentStatus)),
        orderStatus: v.optional(v.picklist([
            "created",
            "pending",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
        ])),
        sortField: v.optional(v.string()),
        sortDirection: v.optional(v.picklist(["asc", "desc"])),
        searchTerm: v.optional(v.string()),
        date: v.optional(v.string()),
    }))
        .query(async ({ input, ctx }) => {
        try {
            return await orderQueries.admin.getPaginatedOrders({
                page: input.page ?? 1,
                pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
                paymentStatus: input.paymentStatus,
                orderStatus: input.orderStatus,
                sortField: input.sortField,
                sortDirection: input.sortDirection,
                searchTerm: input.searchTerm,
                date: input.date,
            });
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.orders_paginated_fetch_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch paginated orders",
                cause: e,
            });
        }
    }),
    getOrderCount: proc
        .input(v.object({ timeRange: timeRangeSchema }))
        .query(async ({ input }) => {
        return await orderQueries.admin.getOrderCount(input.timeRange);
    }),
    getPendingOrders: proc.query(async () => {
        return await orderQueries.admin.getPendingOrders();
    }),
    updateOrderStatus: proc
        .input(v.object({
        id: v.number(),
        status: v.picklist([
            "pending",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
        ]),
    }))
        .mutation(async ({ input, ctx }) => {
        try {
            await orderQueries.admin.updateOrderStatus(input.id, input.status);
            ctx.log.info("order.status_changed", {
                orderId: input.id,
                order_status: input.status,
            });
            return {
                message: `Order status updated successfully to ${input.status}`,
            };
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.order_status_update_failed",
                orderId: input.id,
                order_status: input.status
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to update order status",
                cause: e,
            });
        }
    }),
    getRecentOrdersByProductId: proc
        .input(v.object({ productId: v.number() }))
        .query(async ({ input, ctx }) => {
        try {
            const orders = await orderQueries.admin.getRecentOrdersByProductId(input.productId);
            return orders;
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.recent_orders_fetch_failed",
                productId: input.productId
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch recent orders",
                cause: e,
            });
        }
    }),
    shipOrder: proc
        .input(v.object({ orderId: v.number() }))
        .mutation(async ({ input, ctx }) => {
        const order = await orderQueries.admin.getOrderById(input.orderId);
        if (!order) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Захиалга олдсонгүй",
            });
        }
        if (order.status !== "pending") {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Зөвхөн хүлээгдэж буй захиалгыг илгээх боломжтой",
            });
        }
        try {
            const deliveryResult = await createDelivery(order.id, order.orderNumber, String(order.customerPhone), order.addressZoneId ?? 15, order.address, order.notes);
            await orderQueries.admin.updateOrderStatus(order.id, "shipped", {
                deliveryProvider: "tu-delivery",
            });
            ctx.log.info("order.status_changed", {
                orderId: order.id,
                order_status: "shipped",
            });
            return {
                orderId: order.id,
                orderNumber: order.orderNumber,
                documentNo: deliveryResult.documentNo,
                deliveryOrderId: deliveryResult.orderId,
            };
        }
        catch (e) {
            if (e instanceof TRPCError)
                throw e;
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "admin.ship_order_failed",
                orderId: input.orderId
            });
            const message = e instanceof Error ? e.message : "Захиалга илгээхэд алдаа гарлаа";
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message,
                cause: e,
            });
        }
    }),
    getDeliveryAddressZones: proc.query(async ({ ctx }) => {
        try {
            return await getDeliveryAddressZones();
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "order.fetch_zones_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch delivery zones",
                cause: e,
            });
        }
    }),
});
}

// Existing export — unchanged behavior (admin session auth).
export const order = buildOrderRouter(adminProcedure);
// Bot-facing twin — same resolvers, token-authed procedure for the admin agent.
export const orderBot = buildOrderRouter(botProcedure);
