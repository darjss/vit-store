import { TRPCError } from "@trpc/server";
import { paymentQueries } from "@vit/api/queries";
import * as v from "valibot";
import { paymentProvider, paymentStatus } from "~/lib/constants";
import { confirmTransferPaymentAndNotify } from "~/lib/payments/transfer-confirmation";
import type { TransferReconciliationState } from "~/lib/payments/transfer-reconciliation-status";
import { adminProcedure, router } from "~/lib/trpc";
import { generatePaymentNumber } from "~/lib/utils";

type TransferReconciliationStub = {
	getStatus(): Promise<TransferReconciliationState | null>;
};

const getTransferReconciliationStub = (
	env: Env,
	paymentNumber: string,
): TransferReconciliationStub => {
	const namespace = (env as any).KHAAN_TRANSFER_RECONCILER;
	const id = namespace.idFromName(paymentNumber);
	return namespace.get(id) as TransferReconciliationStub;
};

export const payment = router({
	createPayment: adminProcedure
		.input(
			v.object({
				orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				status: v.picklist(paymentStatus),
				provider: v.picklist(paymentProvider),
				amount: v.pipe(v.number(), v.integer(), v.minValue(0)),
			}),
		)
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
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "createPayment",
					},
				);
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
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "getPayments",
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
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "getPendingPayments",
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
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "getPendingMessengerNotifications",
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
		} catch (error) {
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
		} catch (error) {
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
	getTransferReconciliationStatus: adminProcedure
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
	confirmTransferPayment: adminProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const result = await confirmTransferPaymentAndNotify({
					paymentNumber: input.paymentNumber,
					source: "admin",
				});
				if (!result.confirmed) {
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
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "admin.confirm_transfer_payment_failed",
						paymentNumber: input.paymentNumber,
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to confirm transfer payment",
					cause: error,
				});
			}
		}),
	rejectTransferPayment: adminProcedure
		.input(v.object({ paymentNumber: v.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await paymentQueries.store.updatePaymentStatus(
					input.paymentNumber,
					"failed",
				);
				ctx.log.info("admin.transfer_payment_rejected", {
					paymentNumber: input.paymentNumber,
				});
				return { success: true as const };
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "admin.reject_transfer_payment_failed",
						paymentNumber: input.paymentNumber,
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to reject transfer payment",
					cause: error,
				});
			}
		}),
});
