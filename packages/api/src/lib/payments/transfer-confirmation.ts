import type { PaymentError } from "@vit/shared";
import type { Result as ResultType } from "better-result";
import {
	executePaymentConfirmation,
	type PaymentConfirmationSuccess,
} from "~/lib/payments/payment-confirmation-core";
import { runPaymentPostCommitRecovery } from "~/lib/payments/post-commit-recovery";
import { paymentQueries } from "~/queries/payments";

export type ConfirmPaymentSource =
	| "admin"
	| "auto_reconciliation"
	| "messenger"
	| "qpay_checkout"
	| "qpay_webhook";

export type ConfirmPaymentProvider = "transfer" | "qpay";

type ConfirmPaymentInput = {
	paymentNumber: string;
	provider: ConfirmPaymentProvider;
	source: ConfirmPaymentSource;
	referrer?: string;
	consumedKhaanTransactions?: { fingerprint: string }[];
};

export type ConfirmPaymentSuccess = PaymentConfirmationSuccess;

export function confirmPaymentAndNotify({
	paymentNumber,
	provider,
	referrer,
	consumedKhaanTransactions,
}: ConfirmPaymentInput): Promise<
	ResultType<ConfirmPaymentSuccess, PaymentError>
> {
	return executePaymentConfirmation({
		commit: () =>
			paymentQueries.store.confirmPaymentAndApplyStock(
				paymentNumber,
				provider,
				consumedKhaanTransactions,
			),
		loadOrderNumber: async () =>
			(await paymentQueries.store.getPaymentInfoByNumber(paymentNumber))?.order
				.orderNumber,
		recover: () =>
			runPaymentPostCommitRecovery({
				paymentNumber,
				provider,
				referrer,
			}),
	});
}
