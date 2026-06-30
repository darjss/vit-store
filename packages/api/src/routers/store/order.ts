import { TRPCError } from "@trpc/server";
import { orderQueries, paymentQueries } from "@vit/api/queries";
import { newOrderSchema } from "@vit/shared";
import { deliveryFee } from "@vit/shared/constants";
import * as v from "valibot";
import { eq, inArray } from "drizzle-orm";
import { CustomersTable, OrderDetailsTable, OrdersTable, PaymentsTable, ProductsTable, } from "~/db/schema";
import { assertCanAccessOrder, createCheckoutAccessToken, type CustomerSessionClaims, } from "~/lib/session/checkout-access";
import { getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";
import { trackOrderCreatedServerSide, trackQpayInvoiceCreatedServerSide } from "~/lib/integrations/posthog";
import { kv } from "~/lib/kv";
import { createQpayInvoice } from "~/lib/payments/qpay";
import { createSession, setSessionTokenCookie } from "~/lib/session/store";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { addCustomerToDB } from "~/routers/store/auth";

/**
 * Fire-and-forget: pre-create the QPay invoice so the QR is ready in KV
 * before the user reaches the payment page. `createQr` is the fallback
 * when this misses (invoice expired, pre-create failed, >1h delay).
 * Mirrors the createQr procedure in payment.ts — same dev `/10000` amount
 * hack, same KV key + 1h TTL, same provider/invoiceId write, same tracking.
 */
async function precreateQpayInvoice(paymentNumber: string): Promise<void> {
    const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
    if (!payment || payment.status === "success") {
        return;
    }
    const isDev = process.env.NODE_ENV === "development";
    const qpayResponse = await createQpayInvoice(
        isDev ? Math.ceil(payment.amount / 10000) : payment.amount,
        paymentNumber,
    );
    await kv().put(`QPAY:${paymentNumber}`, JSON.stringify(qpayResponse), {
        expirationTtl: 3600,
    });
    await paymentQueries.store.changePaymentToQpay(paymentNumber, qpayResponse.invoice_id);
    trackQpayInvoiceCreatedServerSide({
        phone: payment.order.customerPhone?.toString() ?? paymentNumber,
        paymentNumber,
    }).catch(() => {});
}

export const order = router({
    getOrdersByCustomerId: verifiedCustomerProcedure.query(async ({ ctx }) => {
        try {
            const q = orderQueries.store;
            const customerPhone = ctx.session.user.phone;
            const orders = await q.getOrdersByCustomerPhone(customerPhone);
            ctx.log.info("order.viewed", {
                customerPhone,
                itemCount: orders.length,
            });
            return orders.map((order) => {
                const { orderDetails, sales, ...orderInfo } = order;
                const salesPriceMap = new Map<number, number>();
                for (const sale of sales) {
                    salesPriceMap.set(sale.productId, sale.sellingPrice);
                }
                const products = orderDetails.map((detail) => ({
                    name: detail.product.name,
                    brandName: detail.product.brand.name,
                    imageUrl: detail.product.images[0]?.url,
                    quantity: detail.quantity,
                    sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
                }));
                return {
                    ...orderInfo,
                    products,
                };
            });
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "order.fetch_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch orders",
                cause: e,
            });
        }
    }),
    addOrder: publicProcedure
        .input(newOrderSchema)
        .mutation(async ({ input, ctx }) => {
        const startTime = performance.now();
        try {
            const productsById = new Map<number, number>();
            for (const item of input.products) {
                const productId = Math.trunc(item.productId);
                const quantity = Math.trunc(item.quantity);
                if (productId <= 0 || quantity <= 0) {
                    continue;
                }
                productsById.set(productId, (productsById.get(productId) ?? 0) + quantity);
            }
            const normalizedProducts = Array.from(productsById.entries()).map(([productId, quantity]) => ({ productId, quantity }));
            if (normalizedProducts.length === 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Сагс хоосон эсвэл буруу байна. Дахин оролдоно уу.",
                });
            }
            const productIds = normalizedProducts.map((p) => p.productId);
            const products = await ctx.db.query.ProductsTable.findMany({
                where: inArray(ProductsTable.id, productIds),
                columns: { id: true, name: true, price: true, stock: true, status: true },
            });
            const existingProductIds = new Set(products.map((p) => p.id));
            const missingProductIds = normalizedProducts
                .filter((p) => !existingProductIds.has(p.productId))
                .map((p) => p.productId);
            if (missingProductIds.length > 0) {
                ctx.log.warn("order.invalid_products", {
                    missingProductIds,
                });
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Зарим бараа олдсонгүй. Сагсаа шинэчлээд дахин оролдоно уу.",
                });
            }
            const productById = new Map(products.map((p) => [p.id, p]));
            for (const item of normalizedProducts) {
                const product = productById.get(item.productId);
                if (!product || product.status !== "active" || product.stock < item.quantity) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: `${product?.name ?? "Бараа"} үлдэгдэл хүрэлцэхгүй байна.`,
                    });
                }
            }
            const productsTotal = normalizedProducts.reduce((acc, item) => {
                const price = productById.get(item.productId)?.price ?? 0;
                return acc + price * item.quantity;
            }, 0);
            const total = productsTotal + deliveryFee;
            const orderNumber = generateOrderNumber();
            const paymentNumberGenerated = generatePaymentNumber();
            const customerPhone = Number(input.phoneNumber);
            // D1 has no interactive transactions. The order insert returns an
            // auto-incremented id that the order-details and payment inserts
            // depend on, so this cannot be a single batch() and runs
            // sequentially instead.
            const txResult = await (async () => {
                await ctx.db
                    .insert(CustomersTable)
                    .values({
                        phone: customerPhone,
                        address: input.address,
                        addressZoneId: input.addressZoneId,
                    })
                    .onConflictDoUpdate({
                        target: CustomersTable.phone,
                        set: {
                            address: input.address,
                            addressZoneId: input.addressZoneId,
                        },
                    });
                const [createdOrder] = await ctx.db
                    .insert(OrdersTable)
                    .values({
                    orderNumber,
                    customerPhone,
                    address: input.address,
                    addressZoneId: input.addressZoneId,
                    notes: input.notes ?? null,
                    total,
                    status: "created",
                    deliveryProvider: "tu-delivery",
                })
                    .returning({ orderId: OrdersTable.id });
                if (!createdOrder)
                    throw new Error("No order ID returned");
                await ctx.db.insert(OrderDetailsTable).values(normalizedProducts.map((p) => ({
                    orderId: createdOrder.orderId,
                    productId: p.productId,
                    quantity: p.quantity,
                })));
                const [payment] = await ctx.db
                    .insert(PaymentsTable)
                    .values({
                    paymentNumber: paymentNumberGenerated,
                    orderId: createdOrder.orderId,
                    provider: "transfer",
                    status: "pending",
                    amount: total,
                })
                    .returning({ paymentNumber: PaymentsTable.paymentNumber });
                return { orderId: createdOrder.orderId, paymentNumber: payment?.paymentNumber ?? null };
            })();
            const orderId = txResult.orderId;
            ctx.log.info("order.created", {
                orderId,
                orderNumber,
                customerPhone: Number(input.phoneNumber),
                total,
                itemCount: normalizedProducts.length,
                status_text: "created",
            });
            const paymentNumber = txResult.paymentNumber;
            if (paymentNumber) {
                ctx.log.info("payment.created", {
                    paymentNumber,
                    orderId,
                    amount: total,
                    provider: "transfer",
                    status_text: "pending",
                });
            }

            // Fire-and-forget: pre-create QPay invoice so the QR is ready before the
            // user reaches the payment page. Failure is non-fatal — createQr is the
            // fallback. KV caches the invoice for 1h.
            if (paymentNumber) {
                precreateQpayInvoice(paymentNumber).catch(() => {});
            }

            // Fire-and-forget server-side PostHog tracking
            trackOrderCreatedServerSide({
                phone: input.phoneNumber,
                orderNumber,
                paymentNumber: paymentNumber ?? undefined,
                itemCount: normalizedProducts.length,
                total,
                referrer: ctx.c.req.header("referer") ?? undefined,
            }).catch(() => {});

            const user = await addCustomerToDB(input.phoneNumber);
            if (!user) {
                ctx.log.error(new Error("No user returned"), {
                    event: "order.customer_create_failed",
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create or retrieve user",
                });
            }
            const checkoutToken = paymentNumber
                ? await createCheckoutAccessToken(ctx, {
                    orderId,
                    orderNumber,
                    paymentNumber,
                    phone: Number(input.phoneNumber),
                })
                : null;
            const checkoutGuestUser = {
                ...user,
                trust: "checkout_guest" as const,
                checkout: paymentNumber
                    ? { orderId, orderNumber, paymentNumber }
                    : undefined,
            } satisfies typeof user & CustomerSessionClaims;
            const { session, token } = await createSession(checkoutGuestUser, kv());
            setSessionTokenCookie(ctx.c, token, session.expiresAt);
            const durationMs = performance.now() - startTime;
            ctx.log.info("auth.session_created", {
                phone: Number(input.phoneNumber),
                sessionId: session.id,
            });
            ctx.log.info("order.flow_complete", {
                orderId,
                orderNumber,
                paymentNumber,
                durationMs,
            });
            if (paymentNumber) {
                try {
                    const paymentInfo = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
                    if (paymentInfo) {
                        await sendDetailedOrderNotification({
                            paymentNumber,
                            customerPhone: paymentInfo.order.customerPhone,
                            address: paymentInfo.order.address,
                            notes: paymentInfo.order.notes,
                            total: paymentInfo.order.total,
                            products: paymentInfo.order.orderDetails.map((detail) => ({
                                name: detail.product.name,
                                quantity: detail.quantity,
                                price: detail.product.price,
                                imageUrl: detail.product.images[0]?.url,
                            })),
                            status: "pending_transfer",
                        });
                    }
                }
                catch (notificationError) {
                    ctx.log.error(notificationError instanceof Error ? notificationError : new Error(String(notificationError)), {
                        event: "order.notification_failed",
                        paymentNumber,
                        orderNumber
                    });
                }
            }
            return { paymentNumber, orderNumber, checkoutToken };
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "order.add_failed"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to add order",
                cause: e,
            });
        }
    }),
    getOrderByOrderNumber: publicProcedure
        .input(v.object({ orderNumber: v.string(), checkoutToken: v.optional(v.string()) }))
        .query(async ({ input, ctx }) => {
        try {
            const order = await assertCanAccessOrder(ctx, input.orderNumber, input.checkoutToken);
            ctx.log.info("order.viewed", { orderNumber: input.orderNumber });
            return order;
        }
        catch (e) {
            if (e instanceof TRPCError) {
                throw e;
            }
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "order.fetch_by_number_failed",
                orderNumber: input.orderNumber
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch order",
                cause: e,
            });
        }
    }),
    getDeliveryAddressZones: publicProcedure
        .query(async ({ ctx }) => {
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
