import type { KhaanTransaction } from "./client";

export type TransferReconciliationStatus =
	| "polling"
	| "matched"
	| "confirmed"
	| "timeout"
	| "auth_required"
	| "ambiguous"
	| "failed";

export type MatchedKhaanTransaction = {
	tranDate?: string;
	time?: string;
	amount: number;
	description: string;
	relatedAccount?: string;
	balance?: number;
};

export type KhaanMatchResult =
	| { status: "none"; matches: [] }
	| { status: "matched"; match: MatchedKhaanTransaction; matches: [MatchedKhaanTransaction] }
	| { status: "ambiguous"; matches: MatchedKhaanTransaction[] };

/**
 * A transaction is "incoming" if the amount is positive.
 * The new Khan Bank statement API doesn't expose amount-type codes,
 * so direction is determined solely by the sign of `amount`.
 */
export function isIncomingKhaanTransaction(transaction: KhaanTransaction) {
	return (transaction.amount ?? 0) > 0;
}

export function findMatchingKhaanTransfer(input: {
	transactions: KhaanTransaction[];
	paymentNumber: string;
	expectedAmount: number;
	currency?: string;
}): KhaanMatchResult {
	const paymentNumber = input.paymentNumber.trim().toUpperCase();

	const matches = input.transactions
		.filter((transaction) => {
			const amount = transaction.amount;
			const description = transaction.description?.toUpperCase() ?? "";

			return (
				amount === input.expectedAmount &&
				description.includes(paymentNumber) &&
				isIncomingKhaanTransaction(transaction)
			);
		})
		.map((transaction) => ({
			tranDate: transaction.tranDate,
			time: transaction.time,
			amount: transaction.amount ?? 0,
			description: transaction.description ?? "",
			relatedAccount: transaction.relatedAccount,
			balance: transaction.balance,
		}));

	if (matches.length === 0) {
		return { status: "none", matches: [] };
	}
	if (matches.length === 1) {
		return { status: "matched", match: matches[0], matches: [matches[0]] };
	}
	return { status: "ambiguous", matches };
}
