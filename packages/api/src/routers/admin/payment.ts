import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import * as v from "valibot";
import { paymentProvider, paymentStatus } from "~/lib/constants";
import { getTransferReconciliationStub } from "~/lib/durable-objects";
import { adminProcedure, baseProcedure, botProcedure, router } from "~/lib/trpc";
import { generatePaymentNumber } from "~/lib/utils";

export function buildPaymentRouter<P extends typeof baseProcedure>(proc: P) {
    return router({
    createPayment: proc
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
    getPayments: proc.query(async ({ ctx }) => {
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
    getPendingPayments: proc.query(async ({ ctx }) => {
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
    getPendingMessengerNotifications: proc.query(async ({ ctx }) => {
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
    getClaimedTransferCount: proc.query(async ({ ctx }) => {
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
    getClaimedTransferPayments: proc.query(async ({ ctx }) => {
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
    getTransferReconciliationStatus: proc
        .input(v.object({ paymentNumber: v.string() }))
        .query(async ({ ctx, input }) => {
            try {
                const reconciler = getTransferReconciliationStub(
                    ctx.c.env,
                    input.paymentNumber,
                );
                return await reconciler.getStatus();
            } catch (error) {
                ctx.log.error(
                    error instanceof Error ? error : new Error(String(error)),
                    {
                        event: "admin.transfer_reconciliation_status_failed",
                        paymentNumber: input.paymentNumber,
                    },
                );
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to get transfer reconciliation status",
                    cause: error,
                });
            }
        }),
    confirmTransferPayment: proc
        .input(v.object({ paymentNumber: v.string() }))
        .mutation(async ({ ctx, input }) => {
            try {
                // Fetch matching Khaan transactions and record their
                // fingerprints as consumed alongside the confirm, so the
                // admin-verified transfer can't be replayed against a later
                // order via the phone fallback (P0-1). The admin doesn't know
                // which specific bank transaction corresponds to the payment,
                // so we mark ALL plausible matches as consumed. Do NOT block
                // the admin confirm on the Khaan fetch failing — catch/log
                // and proceed (admin override is authoritative; an un-findable
                // tx can't be replayed anyway).
                let consumedKhaanTransactions:
                    | { fingerprint: string }[]
                    | undefined;
                try {
                    const reconciler = getTransferReconciliationStub(
                        ctx.c.env,
                        input.paymentNumber,
                    );
                    const fingerprints =
                        await reconciler.collectMatchingKhaanFingerprints(
                            input.paymentNumber,
                        );
                    if (fingerprints && fingerprints.length > 0) {
                        consumedKhaanTransactions = fingerprints.map(
                            (fingerprint) => ({ fingerprint }),
                        );
                    } else if (fingerprints && fingerprints.length === 0) {
                        ctx.log.warn(
                            "admin.confirm_transfer_no_matching_khaan_tx",
                            { paymentNumber: input.paymentNumber },
                        );
                    }
                } catch (error) {
                    ctx.log.error(
                        error instanceof Error
                            ? error
                            : new Error(String(error)),
                        {
                            event: "admin.confirm_transfer_khaan_fetch_failed",
                            paymentNumber: input.paymentNumber,
                        },
                    );
                }

                // Route through the canonical confirm + notify + analytics +
                // cache-purge boundary (F2). This catches the consumed-
                // fingerprint conflict and returns a clean reason instead of
                // an opaque 500, and never leaks the fingerprint hash to the
                // admin UI (F1).
                const result = await confirmPaymentAndNotify({
                    paymentNumber: input.paymentNumber,
                    provider: "transfer",
                    source: "admin",
                    consumedKhaanTransactions,
                });

                if (!result.confirmed) {
                    if (
                        result.reason === "khaan_transaction_already_consumed"
                    ) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message:
                                "Bank transaction already used by another order — needs manual review",
                        });
                    }
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Payment already confirmed or not pending",
                    });
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
                    message: "Failed to confirm transfer payment",
                    cause: error,
                });
            }
        }),
    rejectTransferPayment: proc
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
}
export const payment = buildPaymentRouter(adminProcedure);
export const paymentBot = buildPaymentRouter(botProcedure);
