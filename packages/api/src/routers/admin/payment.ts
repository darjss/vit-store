import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider, paymentStatus } from "~/lib/constants";
import { retryMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
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
    retryMessengerNotification: adminProcedure
        .input(v.object({ id: v.pipe(v.number(), v.integer(), v.minValue(1)) }))
        .mutation(async ({ ctx, input }) => {
            const result = await retryMessengerNotificationFailure(input.id);
            if (!result.ok) {
                ctx.log.warn("admin.retry_messenger_notification_failed", {
                    notificationId: input.id,
                    reason: result.reason,
                });
                throw new TRPCError({
                    code: result.reason === "not_found" ? "NOT_FOUND" : "BAD_GATEWAY",
                    message: result.reason === "not_found"
                        ? "Notification not found"
                        : "Messenger retry failed; queued for another retry",
                });
            }
            return result;
        }),
});
