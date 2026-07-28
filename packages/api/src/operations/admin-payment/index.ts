import {
	adminBooleanSuccessSchema,
	paymentErrorSchema,
	type PaymentError,
} from "@vit/shared";
import { Result } from "better-result";
import { match } from "dismatch";
import {
	bankTransactionAlreadyConsumed,
	paymentAlreadyConfirmed,
	paymentConfirmationConflict,
	paymentMethodMismatch,
	paymentNotFound,
	paymentNotPending,
} from "~/errors/factories/admin";
import type { Context } from "~/lib/context";
import { getTransferReconciliationStub } from "~/lib/durable-objects";
import { confirmPaymentAndNotify } from "~/lib/payments/transfer-confirmation";
import { paymentQueries } from "~/queries/payments";
import type { LegacyTrpcError } from "~/result/legacy-trpc";

export const paymentReviewResultSchemas = {
	value: adminBooleanSuccessSchema,
	error: paymentErrorSchema,
};

export const confirmTransferPayment = async (
	ctx: Context,
	paymentNumber: string,
) => {
	const payment = await paymentQueries.store.getPaymentByNumber(paymentNumber);
	if (!payment) return Result.err(paymentNotFound());
	if (payment.provider !== "transfer") {
		return Result.err(paymentMethodMismatch("transfer", payment.provider));
	}
	if (payment.status === "success") {
		return Result.err(paymentAlreadyConfirmed(payment.order?.orderNumber));
	}
	if (payment.status === "failed") {
		return Result.err(paymentNotPending(payment.status));
	}

	let consumedKhaanTransactions: { fingerprint: string }[] | undefined;
	try {
		const reconciler = getTransferReconciliationStub(ctx.c.env, paymentNumber);
		const fingerprints =
			await reconciler.collectMatchingKhaanFingerprints(paymentNumber);
		if (fingerprints && fingerprints.length > 0) {
			consumedKhaanTransactions = fingerprints.map((fingerprint) => ({
				fingerprint,
			}));
		} else if (fingerprints) {
			ctx.log.warn("admin.confirm_transfer_no_matching_khaan_tx", {
				paymentNumber,
			});
		}
	} catch (error) {
		ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "admin.confirm_transfer_khaan_fetch_failed",
			paymentNumber,
		});
	}

	const confirmation = await confirmPaymentAndNotify({
		paymentNumber,
		provider: "transfer",
		source: "admin",
		consumedKhaanTransactions,
	});
	if (!confirmation.confirmed) {
		return confirmation.reason === "khaan_transaction_already_consumed"
			? Result.err(bankTransactionAlreadyConsumed())
			: Result.err(paymentConfirmationConflict(false));
	}

	ctx.log.info("admin.transfer_payment_confirmed", { paymentNumber });
	return Result.ok({ success: true as const });
};

export const rejectTransferPayment = async (
	ctx: Context,
	paymentNumber: string,
) => {
	const payment = await paymentQueries.store.getPaymentByNumber(paymentNumber);
	if (!payment) return Result.err(paymentNotFound());
	await paymentQueries.store.updatePaymentStatus(paymentNumber, "failed");
	ctx.log.info("admin.transfer_payment_rejected", { paymentNumber });
	return Result.ok({ success: true as const });
};

export const paymentErrorToLegacyTrpc = (error: PaymentError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		PaymentNotFound: () => ({
			code: "NOT_FOUND",
			message: "Payment not found",
		}),
		PaymentAccessDenied: () => ({
			code: "FORBIDDEN",
			message: "Payment access denied",
		}),
		PaymentAlreadyConfirmed: () => ({
			code: "CONFLICT",
			message: "Payment already confirmed or not pending",
		}),
		PaymentNotPending: () => ({
			code: "CONFLICT",
			message: "Payment already confirmed or not pending",
		}),
		PaymentMethodMismatch: () => ({
			code: "CONFLICT",
			message: "Payment method mismatch",
		}),
		PaymentProviderUnavailable: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Payment provider unavailable",
		}),
		PaymentConfirmationConflict: () => ({
			code: "CONFLICT",
			message: "Payment already confirmed or not pending",
		}),
		BankTransactionAlreadyConsumed: () => ({
			code: "CONFLICT",
			message:
				"Bank transaction already used by another order — needs manual review",
		}),
		ManualReviewRequired: () => ({
			code: "CONFLICT",
			message: "Payment requires manual review",
		}),
	});
