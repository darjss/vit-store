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
	transactionDate?: string;
	txnTime?: string;
	amount: number;
	currency: string;
	transactionRemarks: string;
	txnBranchId?: string;
};

export type KhaanMatchResult =
	| { status: "none"; matches: [] }
	| { status: "matched"; match: MatchedKhaanTransaction; matches: [MatchedKhaanTransaction] }
	| { status: "ambiguous"; matches: MatchedKhaanTransaction[] };

const INCOMING_AMOUNT_TYPE_CODES = new Set(["04", "credit", "cr", "c"]);

const normalized = (value: unknown) =>
	typeof value === "string" ? value.trim().toLowerCase() : "";

export function isIncomingKhaanTransaction(transaction: KhaanTransaction) {
	const amount = transaction.amount?.amount ?? 0;
	const code = normalized(transaction.amountType?.cmCode);
	const description = normalized(transaction.amountType?.codeDescription);

	return (
		amount > 0 &&
		(INCOMING_AMOUNT_TYPE_CODES.has(code) ||
			description.includes("credit") ||
			description.includes("орлого"))
	);
}

export function findMatchingKhaanTransfer(input: {
	transactions: KhaanTransaction[];
	paymentNumber: string;
	expectedAmount: number;
	currency?: string;
}): KhaanMatchResult {
	const expectedCurrency = (input.currency ?? "MNT").toUpperCase();
	const paymentNumber = input.paymentNumber.trim().toUpperCase();

	const matches = input.transactions
		.filter((transaction) => {
			const amount = transaction.amount?.amount;
			const currency = transaction.amount?.currency?.toUpperCase();
			const remarks = transaction.transactionRemarks?.toUpperCase() ?? "";

			return (
				amount === input.expectedAmount &&
				currency === expectedCurrency &&
				remarks.includes(paymentNumber) &&
				isIncomingKhaanTransaction(transaction)
			);
		})
		.map((transaction) => ({
			transactionDate: transaction.transactionDate,
			txnTime: transaction.txnTime,
			amount: transaction.amount?.amount ?? 0,
			currency: transaction.amount?.currency ?? expectedCurrency,
			transactionRemarks: transaction.transactionRemarks ?? "",
			txnBranchId: transaction.txnBranchId,
		}));

	if (matches.length === 0) {
		return { status: "none", matches: [] };
	}
	if (matches.length === 1) {
		return { status: "matched", match: matches[0], matches: [matches[0]] };
	}
	return { status: "ambiguous", matches };
}
