import { TRPCError } from "@trpc/server";
import { orderQueries, paymentQueries } from "@vit/api/queries";
import { newOrderSchema } from "@vit/shared";
import { bankTransfer, deliveryFee } from "@vit/shared/constants";
import * as v from "valibot";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { CustomersTable, OrderDetailsTable, OrdersTable, PaymentsTable, ProductsTable, } from "~/db/schema";
import { cartFingerprint } from "~/lib/order/cart-fingerprint";
import { assertCanAccessOrder, createCheckoutAccessToken, type CustomerSessionClaims, } from "~/lib/session/checkout-access";
import { getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";
import { trackOrderCreatedServerSide, trackQpayInvoiceCreatedServerSide } from "~/lib/integrations/posthog";
import { kv } from "~/lib/kv";
import { createQpayInvoice } from "~/lib/payments/qpay";
import { createSession, setSessionTokenCookie } from "~/lib/session/store";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";

/**
 * Pre-create the QPay invoice so the QR is ready in KV before the user
 * reaches the payment page. `createQr` is the fallback when this misses
 * (invoice expired, pre-create failed, >1h delay). The issued invoice is
 * stored without changing the provider because this work is speculative.
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
    await paymentQueries.store.storeQpayInvoice(paymentNumber, qpayResponse.invoice_id);
    await kv().put(`QPAY:${paymentNumber}`, JSON.stringify(qpayResponse), {
        expirationTtl: 3600,
    });
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
            const submittedFingerprint = cartFingerprint(normalizedProducts);
            // Facebook iOS often kills the guest session before retry. Phone + cart
            // identity owns the unpaid slot; a client checkout id does not survive.
            const reuseAfter = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const txResult = await ctx.db.transaction(async (tx) => {
                const existingCustomer = await tx.query.CustomersTable.findFirst({
                    where: eq(CustomersTable.phone, customerPhone),
                });
                const [customer] = existingCustomer
                    ? await tx
                        .update(CustomersTable)
                        .set({
                            address: input.address,
                            ...(input.addressZoneId !== undefined && {
                                addressZoneId: input.addressZoneId,
                            }),
                        })
                        .where(eq(CustomersTable.phone, customerPhone))
                        .returning()
                    : await tx
                        .insert(CustomersTable)
                        .values({
                        phone: customerPhone,
                        address: input.address,
                        addressZoneId: input.addressZoneId ?? null,
                    })
                        .returning();
                if (!customer)
                    throw new Error("No customer returned");

                const pendingOrder = await tx.query.OrdersTable.findFirst({
                    where: and(
                        eq(OrdersTable.customerPhone, customerPhone),
                        eq(OrdersTable.status, "created"),
                        isNull(OrdersTable.deletedAt),
                        gte(OrdersTable.createdAt, reuseAfter),
                    ),
                    orderBy: desc(OrdersTable.createdAt),
                    with: {
                        orderDetails: {
                            columns: { productId: true, quantity: true },
                            where: isNull(OrderDetailsTable.deletedAt),
                        },
                        payments: {
                            columns: {
                                paymentNumber: true,
                                status: true,
                                amount: true,
                            },
                            where: isNull(PaymentsTable.deletedAt),
                            orderBy: desc(PaymentsTable.createdAt),
                        },
                    },
                });
                const openPayment = pendingOrder?.payments.find(
                    (payment) =>
                        (payment.status === "pending" ||
                            payment.status === "customer_claimed_paid") &&
                        payment.paymentNumber,
                );
                if (
                    pendingOrder &&
                    openPayment &&
                    cartFingerprint(pendingOrder.orderDetails) === submittedFingerprint
                ) {
                    await tx
                        .update(OrdersTable)
                        .set({
                            address: input.address,
                            addressZoneId: input.addressZoneId ?? pendingOrder.addressZoneId,
                            notes: input.notes ?? null,
                        })
                        .where(eq(OrdersTable.id, pendingOrder.id));
                    return {
                        customer,
                        reused: true as const,
                        orderId: pendingOrder.id,
                        orderNumber: pendingOrder.orderNumber,
                        paymentNumber: openPayment.paymentNumber,
                        total: openPayment.amount ?? pendingOrder.total,
                    };
                }
                // Different cart: retire only a still-pending Payment. Do not auto-
                // fail customer_claimed_paid — support must review those.
                if (
                    pendingOrder &&
                    openPayment &&
                    openPayment.status === "pending" &&
                    openPayment.paymentNumber
                ) {
                    const [failedPayment] = await tx
                        .update(PaymentsTable)
                        .set({ status: "failed" })
                        .where(
                            and(
                                eq(PaymentsTable.paymentNumber, openPayment.paymentNumber),
                                eq(PaymentsTable.status, "pending"),
                                isNull(PaymentsTable.deletedAt),
                            ),
                        )
                        .returning({ paymentNumber: PaymentsTable.paymentNumber });
                    // Only cancel the Order if we actually failed the Payment. A concurrent
                    // claim→customer_claimed_paid would make the update match 0 rows.
                    if (failedPayment) {
                        await tx
                            .update(OrdersTable)
                            .set({ status: "cancelled" })
                            .where(
                                and(
                                    eq(OrdersTable.id, pendingOrder.id),
                                    eq(OrdersTable.status, "created"),
                                    isNull(OrdersTable.deletedAt),
                                ),
                            );
                        ctx.log.info("order.prior_unpaid_cancelled", {
                            orderId: pendingOrder.id,
                            orderNumber: pendingOrder.orderNumber,
                            paymentNumber: openPayment.paymentNumber,
                            customerPhone,
                        });
                    }
                }

                const [createdOrder] = await tx
                    .insert(OrdersTable)
                    .values({
                    orderNumber,
                    customerPhone,
                    address: input.address,
                    addressZoneId: input.addressZoneId ?? null,
                    notes: input.notes ?? null,
                    total,
                    status: "created",
                    deliveryProvider: "tu-delivery",
                })
                    .returning({ orderId: OrdersTable.id });
                if (!createdOrder)
                    throw new Error("No order ID returned");
                await tx.insert(OrderDetailsTable).values(normalizedProducts.map((p) => ({
                    orderId: createdOrder.orderId,
                    productId: p.productId,
                    quantity: p.quantity,
                    price: productById.get(p.productId)?.price ?? null,
                })));
                const [payment] = await tx
                    .insert(PaymentsTable)
                    .values({
                    paymentNumber: paymentNumberGenerated,
                    orderId: createdOrder.orderId,
                    provider: "transfer",
                    status: "pending",
                    amount: total,
                })
                    .returning({ paymentNumber: PaymentsTable.paymentNumber });
                return {
                    customer,
                    reused: false as const,
                    orderId: createdOrder.orderId,
                    orderNumber,
                    paymentNumber: payment?.paymentNumber ?? null,
                    total,
                };
            });
            const orderId = txResult.orderId;
            const reused = txResult.reused;
            const resolvedOrderNumber = txResult.orderNumber;
            const resolvedTotal = txResult.total;
            if (reused) {
                ctx.log.info("order.checkout_reused", {
                    orderId,
                    orderNumber: resolvedOrderNumber,
                    customerPhone: Number(input.phoneNumber),
                    total,
                    itemCount: normalizedProducts.length,
                });
            } else {
                ctx.log.info("order.created", {
                    orderId,
                    orderNumber: resolvedOrderNumber,
                    customerPhone: Number(input.phoneNumber),
                    total,
                    itemCount: normalizedProducts.length,
                    status_text: "created",
                });
            }
            const paymentNumber = txResult.paymentNumber;
            if (paymentNumber && !reused) {
                ctx.log.info("payment.created", {
                    paymentNumber,
                    orderId,
                    amount: total,
                    provider: "transfer",
                    status_text: "pending",
                });
            }

            // Keep speculative QPay invoice creation alive after the response.
            // Failure is non-fatal — createQr is the fallback.
            if (paymentNumber && !reused) {
                ctx.c.executionCtx.waitUntil(precreateQpayInvoice(paymentNumber).catch((error) => {
                    ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                        event: "qpay.invoice_precreate_failed",
                        paymentNumber,
                    });
                }));
            }

            // Fire-and-forget server-side PostHog tracking
            if (!reused) {
                trackOrderCreatedServerSide({
                    phone: input.phoneNumber,
                    orderNumber: resolvedOrderNumber,
                    paymentNumber: paymentNumber ?? undefined,
                    itemCount: normalizedProducts.length,
                    total,
                    referrer: ctx.c.req.header("referer") ?? undefined,
                }).catch(() => {});
            }

            const checkoutToken = paymentNumber
                ? await createCheckoutAccessToken(ctx, {
                    orderId,
                    orderNumber: resolvedOrderNumber,
                    paymentNumber,
                    phone: Number(input.phoneNumber),
                })
                : null;
            const checkoutGuestUser = {
                ...txResult.customer,
                trust: "checkout_guest" as const,
                checkout: paymentNumber
                    ? { orderId, orderNumber: resolvedOrderNumber, paymentNumber }
                    : undefined,
            } satisfies typeof txResult.customer & CustomerSessionClaims;
            const { session, token } = await createSession(checkoutGuestUser, kv());
            setSessionTokenCookie(ctx.c, token, session.expiresAt);
            const durationMs = performance.now() - startTime;
            ctx.log.info("auth.session_created", {
                phone: Number(input.phoneNumber),
                sessionId: session.id,
            });
            ctx.log.info("order.flow_complete", {
                orderId,
                orderNumber: resolvedOrderNumber,
                paymentNumber,
                reused,
                durationMs,
            });
            if (paymentNumber && !reused) {
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
                        orderNumber: resolvedOrderNumber
                    });
                }
            }
            // F9/H5: return the full PaymentOptions props so the client does not
            // need a second getPaymentByNumber round-trip after addOrder.
            return {
                paymentNumber,
                orderNumber: resolvedOrderNumber,
                checkoutToken,
                total: resolvedTotal,
                customerPhone: input.phoneNumber,
                accountNumber: ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
                accountName: ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
            };
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
