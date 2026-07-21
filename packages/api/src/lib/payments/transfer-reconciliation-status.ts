// Canonical source of the transfer-reconciliation status/state types for this
// repo (F4). Both the admin router and the TransferReconciliationObject import
// from here instead of redefining the union locally.
//
// khaan-client owns its own copy (src/reconciliation/orchestrator.ts) for its
// standalone async-iterator orchestrator; we do NOT re-export from khaan-client
// here because that would couple the @vit/api data-access package to a
// server-only bank SDK (the same boundary LBL-5 protects). The two unions are
// kept in sync manually; they are a 7-value string union that changes very
// rarely. The DO imports MatchedKhaanTransaction (the transaction shape) from
// khaan-client directly, but the status/state union comes from here.

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
