import { TRPCError } from "@trpc/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { customerQueries, orderQueries, paymentQueries, productQueries, purchaseQueries, salesQueries, } from "@vit/api/queries";
import { addOrderSchema, timeRangeSchema, updateOrderSchema, } from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, paymentStatus } from "~/lib/constants";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { createDelivery, getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { planPaymentTransition } from "./order-transition";
import { db } from "~/db/client";
import { ProductsTable, SalesTable, } from "~/db/schema";
import { getAverageCostOfProduct } from "~/queries/payments";

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
            const order = await orderQueries.admin.createOrder({
                orderNumber: orderNumber,
                customerPhone: Number(input.customerPhone),
                status: input.status,
                notes: input.notes ?? null,
                total: orderTotal,
                address: input.address,
                deliveryProvider: input.deliveryProvider,
            });
            const orderId = order?.orderId;
            const orderDetails = input.products.map((product) => ({
                productId: product.productId,
                quantity: product.quantity,
            }));
            await orderQueries.admin.createOrderDetails(orderId, orderDetails);
            if (input.paymentStatus === "success") {
                for (const product of input.products) {
                    const productCost = await purchaseQueries.admin.getAverageCostOfProduct(product.productId, new Date());
                    await salesQueries.admin.addSale({
                        productCost: productCost,
                        quantitySold: product.quantity,
                        orderId: order.orderId,
                        sellingPrice: product.price,
                        productId: product.productId,
                    });
                    await productQueries.admin.updateStock(product.productId, product.quantity, "minus");
                }
            }
            try {
                const paymentNumber = generatePaymentNumber();
                await paymentQueries.admin.createPayment({
                    paymentNumber,
                    orderId: orderId,
                    provider: "transfer",
                    status: input.paymentStatus,
                    amount: orderTotal,
                });
                ctx.log.info("payment.created", {
                    paymentNumber,
                    orderId,
                    amount: orderTotal,
                    provider: "transfer",
                    payment_status: input.paymentStatus,
                });
            }
            catch (error) {
                ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                    event: "admin.payment_create_failed",
                    orderId
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create payment",
                    cause: error,
                });
            }
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
            await orderQueries.admin.updateOrder(input.id, {
                customerPhone: Number(input.customerPhone),
                status: input.status,
                notes: input.notes,
                total: orderTotal,
                address: input.address,
                addressZoneId: input.addressZoneId ?? null,
            });
            const currentOrderDetails = await orderQueries.admin.getOrderDetailsByOrderId(input.id);
            await orderQueries.admin.deleteOrderDetails(input.id);
            await Promise.all(input.products.map((product) =>
                orderQueries.admin.createOrderDetails(input.id, [
                    {
                        productId: product.productId,
                        quantity: product.quantity,
                    },
                ])
            ));
            // Critical section: prev-status read, sales insert, stock changes,
            // and payment update in one transaction so concurrent saves can't
            // both observe prev=pending and double-book.
            //
            // Invariant: each order line's stock is deducted EXACTLY ONCE,
            // when payment transitions to success. This matches addOrder
            // (deducts on creation with paymentStatus==="success") and
            // confirmPaymentAndApplyStock (deducts on transition to success).
            // Pending orders never touch stock.
            await db().transaction(async (tx) => {
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
                        await tx
                            .update(ProductsTable)
                            .set({ stock: sql`${ProductsTable.stock} - ${product.quantity}` })
                            .where(and(eq(ProductsTable.id, product.productId), isNull(ProductsTable.deletedAt)));
                    }
                    else if (wasSuccess) {
                        if (existingDetail) {
                            const quantityDiff = product.quantity - existingDetail.quantity;
                            if (quantityDiff !== 0) {
                                await tx
                                    .update(ProductsTable)
                                    .set({ stock: sql`${ProductsTable.stock} ${quantityDiff > 0 ? sql`-` : sql`+`} ${Math.abs(quantityDiff)}` })
                                    .where(and(eq(ProductsTable.id, product.productId), isNull(ProductsTable.deletedAt)));
                            }
                        }
                        else {
                            await tx
                                .update(ProductsTable)
                                .set({ stock: sql`${ProductsTable.stock} - ${product.quantity}` })
                                .where(and(eq(ProductsTable.id, product.productId), isNull(ProductsTable.deletedAt)));
                        }
                    }
                    // else: pending/other — no stock changes (deducted on transition)
                }
                if (wasSuccess && !transitionedToSuccess) {
                    const removedProducts = currentOrderDetails.filter((detail) => !input.products.some((p) => p.productId === detail.productId));
                    for (const detail of removedProducts) {
                        await tx
                            .update(ProductsTable)
                            .set({ stock: sql`${ProductsTable.stock} + ${detail.quantity}` })
                            .where(and(eq(ProductsTable.id, detail.productId), isNull(ProductsTable.deletedAt)));
                    }
                }
                await paymentQueries.admin.updatePaymentStatusTx(tx, input.id, input.paymentStatus);
                ctx.log.info("order.updated", {
                    orderId: input.id,
                    total: orderTotal,
                    order_status: input.status,
                    payment_transitioned: transitionedToSuccess,
                });
            });
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
    deleteOrder: proc
        .input(v.object({ id: v.number() }))
        .mutation(async ({ input, ctx }) => {
        try {
            const orderDetails = await orderQueries.admin.getOrderDetailsByOrderId(input.id);
            const restoreStockPromises = orderDetails
                .filter((detail) => !detail.deletedAt)
                .map((detail) => productQueries.admin.updateStock(detail.productId, detail.quantity, "add"));
            await orderQueries.admin.softDeleteOrder(input.id);
            await Promise.allSettled(restoreStockPromises);
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
            const details = await orderQueries.admin.getOrderDetailsByOrderId(input.id);
            const deductPromises = details
                .filter((d) => d.deletedAt !== null && d.deletedAt !== undefined)
                .map((d) => productQueries.admin.updateStock(d.productId, d.quantity, "minus"));
            await Promise.allSettled(deductPromises);
            await orderQueries.admin.restoreOrder(input.id);
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
    sendDeliveryTU: proc
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
                message: "Зөвхөн хүлээгдэж буй захиалгыг TU руу илгээнэ",
            });
        }
        try {
            const deliveryResult = await createDelivery(order.id, order.orderNumber, String(order.customerPhone), 15, order.address, order.notes);
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
                event: "admin.send_delivery_tu_failed",
                orderId: input.orderId
            });
            const message = e instanceof Error ? e.message : "TU хүргэлт илгээхэд алдаа гарлаа";
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
