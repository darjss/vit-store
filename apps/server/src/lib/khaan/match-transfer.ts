import type { KhaanTransaction } from "khaan-client";
import {
	type KhaanMatchResult,
	findMatchingKhaanTransfer,
} from "khaan-client/reconciliation";

const NO_MATCH: KhaanMatchResult = { status: "none", matches: [] };

const CLOCK_SKEW_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function matchKhaanTransfer(input: {
	transactions: KhaanTransaction[];
	paymentNumber: string;
	phone: string;
	expectedAmount: number;
}): KhaanMatchResult {
	const phone = input.phone.trim();
	const paymentNumber = input.paymentNumber.trim();

	const byPaymentNumber = paymentNumber
		? findMatchingKhaanTransfer({
				transactions: input.transactions,
				paymentNumber,
				expectedAmount: input.expectedAmount,
			})
		: NO_MATCH;
	if (byPaymentNumber.status !== "none") {
		return byPaymentNumber;
	}
	if (!phone) {
		return NO_MATCH;
	}
	return findMatchingKhaanTransfer({
		transactions: input.transactions,
		paymentNumber: phone,
		expectedAmount: input.expectedAmount,
	});
}

function parseTimeOfDayMs(time: string | undefined): number | null {
	if (!time) {
		return null;
	}
	const match = /^(\d{1,2}):(\d{2})/.exec(time.trim());
	if (!match) {
		return null;
	}
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) {
		return null;
	}
	return (hours * 60 + minutes) * 60 * 1000;
}

function transactionLatestInstantMs(
	transaction: KhaanTransaction,
): number | null {
	if (!transaction.tranDate) {
		return null;
	}
	const parsed = Date.parse(transaction.tranDate);
	if (Number.isNaN(parsed)) {
		return null;
	}
	const startOfDay = parsed - (parsed % ONE_DAY_MS);
	const timeOfDay = parseTimeOfDayMs(transaction.time);
	if (timeOfDay === null) {
		return startOfDay + ONE_DAY_MS - 1;
	}
	return startOfDay + timeOfDay;
}

export function isTransactionWithinPaymentWindow(
	transaction: KhaanTransaction,
	paymentCreatedAtMs: number,
	skewMs: number = CLOCK_SKEW_MS,
): boolean {
	const instant = transactionLatestInstantMs(transaction);
	if (instant === null) {
		return false;
	}
	return instant >= paymentCreatedAtMs - skewMs;
}

export function filterTransactionsWithinPaymentWindow(
	transactions: KhaanTransaction[],
	paymentCreatedAtMs: number,
	skewMs: number = CLOCK_SKEW_MS,
): KhaanTransaction[] {
	return transactions.filter((transaction) =>
		isTransactionWithinPaymentWindow(transaction, paymentCreatedAtMs, skewMs),
	);
}

export async function khaanTransactionFingerprint(transaction: {
	tranDate?: string;
	time?: string;
	amount?: number;
	description?: string;
	relatedAccount?: string;
	balance?: number;
}): Promise<string> {
	const identity = [
		transaction.tranDate ?? "",
		transaction.time ?? "",
		String(transaction.amount ?? ""),
		transaction.description ?? "",
		transaction.relatedAccount ?? "",
		String(transaction.balance ?? ""),
	].join("|");
	const bytes = new TextEncoder().encode(identity);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
