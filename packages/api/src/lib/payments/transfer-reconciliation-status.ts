import type { TransferReconciliation } from "@vit/shared";

export type TransferReconciliationStatus = TransferReconciliation["status"];
export type TransferReconciliationErrorCode = NonNullable<
	TransferReconciliation["lastError"]
>;

export type TransferReconciliationState = {
	paymentNumber: string;
	status: TransferReconciliationStatus;
	attempts: number;
	startedAt: string;
	expiresAt: string;
	nextPollAt: string | null;
	lastError: TransferReconciliationErrorCode | null;
	matchedTransaction?: {
		tranDate?: string;
		time?: string;
		amount: number;
		description: string;
		relatedAccount?: string;
		balance?: number;
	};
};

/** Remove bank/provider transaction details before any RPC response. */
export const toPublicTransferReconciliation = (
	state: TransferReconciliationState | null,
): TransferReconciliation | null =>
	state
		? {
				paymentNumber: state.paymentNumber,
				status: state.status,
				attempts: state.attempts,
				startedAt: state.startedAt,
				expiresAt: state.expiresAt,
				nextPollAt: state.nextPollAt,
				lastError: state.lastError,
			}
		: null;
