import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider, paymentStatus } from "~/lib/constants";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";
import { trackPaymentConfirmedServerSide } from "~/lib/integrations/posthog";
import { adminProcedure, router } from "~/lib/trpc";
import { generatePaymentNumber } from "~/lib/utils";

export const payment = router({
    createPayment: adminProcedure
        .input(v.object({
        orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
        status: v.picklist(paymentStatus),
        provider: v.picklist(paymentProvider),
        amount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }))
        .mutation(async ({ ctx, input }) => {
        try {
            const result = await paymentQueries.admin.createPayment({
                paymentNumber: generatePaymentNumber(),
                orderId: input.orderId,
                provider: input.provider,
                status: input.status,
                amount: input.amount,
            });
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "createPayment"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to create payment",
                cause: error,
            });
        }
    }),
    getPayments: adminProcedure.query(async ({ ctx }) => {
        try {
            const result = await paymentQueries.admin.getPayments();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getPayments"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get payments",
                cause: error,
            });
        }
    }),
    getPendingPayments: adminProcedure.query(async ({ ctx }) => {
        try {
            const result = await paymentQueries.admin.getPendingPayments();
            return result;
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getPendingPayments"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get pending payments",
                cause: error,
            });
        }
    }),
    getPendingMessengerNotifications: adminProcedure.query(async ({ ctx }) => {
        try {
            return await paymentQueries.admin.getPendingMessengerNotifications();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getPendingMessengerNotifications"
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get pending messenger notifications",
                cause: error,
            });
        }
    }),
    getClaimedTransferCount: adminProcedure.query(async ({ ctx }) => {
        try {
            return await paymentQueries.admin.getClaimedTransferCount();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getClaimedTransferCount",
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get claimed transfer count",
                cause: error,
            });
        }
    }),
    getClaimedTransferPayments: adminProcedure.query(async ({ ctx }) => {
        try {
            return await paymentQueries.admin.getClaimedTransferPayments();
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "getClaimedTransferPayments",
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to get claimed transfer payments",
                cause: error,
            });
        }
    }),
    confirmTransferPayment: adminProcedure
        .input(v.object({ paymentNumber: v.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                const q = paymentQueries.store;
                const confirmed = await q.confirmPaymentAndApplyStock(
                    input.paymentNumber,
                    "transfer",
                );
                if (!confirmed) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Payment already confirmed or not pending",
                    });
                }

                try {
                    const paymentInfo = await q.getPaymentInfoByNumber(input.paymentNumber);
                    if (paymentInfo) {
                        await sendDetailedOrderNotification({
                            paymentNumber: input.paymentNumber,
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
                            status: "payment_confirmed",
                        });
                        await trackPaymentConfirmedServerSide({
                            phone: paymentInfo.order.customerPhone?.toString() ?? input.paymentNumber,
                            paymentNumber: input.paymentNumber,
                            orderNumber: paymentInfo.order.orderNumber,
                            provider: "transfer",
                            revenue: paymentInfo.order.total,
                        });
                    }
                } catch (notificationError) {
                    ctx.log.error(
                        notificationError instanceof Error
                            ? notificationError
                            : new Error(String(notificationError)),
                        {
                            event: "admin.confirm_transfer_notification_failed",
                            paymentNumber: input.paymentNumber,
                        },
                    );
                }

                ctx.log.info("admin.transfer_payment_confirmed", {
                    paymentNumber: input.paymentNumber,
                });
                return { success: true as const };
            } catch (error) {
                if (error instanceof TRPCError) {
                    throw error;
                }
                ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                    event: "admin.confirm_transfer_payment_failed",
                    paymentNumber: input.paymentNumber,
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: error instanceof Error ? error.message : "Failed to confirm transfer payment",
                    cause: error,
                });
            }
        }),
    rejectTransferPayment: adminProcedure
        .input(v.object({ paymentNumber: v.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                await paymentQueries.store.updatePaymentStatus(input.paymentNumber, "failed");
                ctx.log.info("admin.transfer_payment_rejected", {
                    paymentNumber: input.paymentNumber,
                });
                return { success: true as const };
            } catch (error) {
                ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                    event: "admin.reject_transfer_payment_failed",
                    paymentNumber: input.paymentNumber,
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to reject transfer payment",
                    cause: error,
                });
            }
        }),
});
