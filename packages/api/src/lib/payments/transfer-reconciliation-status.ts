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
		tranDate?: string;
		time?: string;
		amount: number;
		description: string;
		relatedAccount?: string;
		balance?: number;
	};
};
