export type TransferReconciliationStatus =
	| "polling"
	| "matched"
	| "confirmed"
	| "timeout"
	| "auth_required"
	| "ambiguous"
	| "failed";

export type TransferReconciliationState = {
	paymentNumber: string;
	status: TransferReconciliationStatus;
	attempts: number;
	startedAt: string;
	expiresAt: string;
	nextPollAt: string | null;
	lastError: string | null;
	matchedTransaction?: {
		transactionDate?: string;
		txnTime?: string;
		amount: number;
		currency: string;
		transactionRemarks: string;
		txnBranchId?: string;
	};
};
