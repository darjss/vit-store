import type { KhaanTransaction } from "khaan-client";
import {
	type KhaanMatchResult,
	findMatchingKhaanTransfer,
} from "khaan-client/reconciliation";

const NO_MATCH: KhaanMatchResult = { status: "none", matches: [] };

const CLOCK_SKEW_MS = 10 * 60 * 1000;

// Khan Bank operates in Ulaanbaatar (UTC+8, no DST). `tranDate` is the UB
// calendar date (sent as a UTC-midnight ISO string) and `time` is a UB-local
// HH:MM field. We reconstruct the instant with an explicit +08:00 offset so
// the window check compares true UTC instants against the UTC payment time.
const UB_OFFSET = "+08:00";

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

function parseTimeOfDay(time: string | undefined): {
	hours: number;
	minutes: number;
} | null {
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
	return { hours, minutes };
}

// Extracts the YYYY-MM-DD calendar-date portion of `tranDate` directly from
// the string. We must NOT use Date.parse here: Khaan sends the UB date as a
// UTC-midnight ISO string ("2026-06-28T00:00:00Z"), and parsing it as UTC then
// reading .getUTC* would work, but any local-time reads would shift the date
// in non-UTC host timezones. The raw string is the authoritative UB date.
function parseUbDate(tranDate: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(tranDate.trim());
	if (!match) {
		return null;
	}
	return `${match[1]}-${match[2]}-${match[3]}`;
}

function transactionLatestInstantMs(
	transaction: KhaanTransaction,
): number | null {
	if (!transaction.tranDate) {
		return null;
	}
	const ubDate = parseUbDate(transaction.tranDate);
	if (!ubDate) {
		return null;
	}
	const time = parseTimeOfDay(transaction.time);
	// Missing/unparseable `time`: use the END of the UB day (23:59:59+08:00 =
	// 15:59:59 UTC same calendar day). This is the latest instant that still
	// belongs to the same Mongolia day, so a missing-time transfer can never
	// be treated as occurring in the next Mongolia day. The previous code used
	// UTC end-of-day (23:59:59Z = 07:59:59 next UB day), which admitted ~8h of
	// next-day staleness.
	const timeSuffix = time
		? `T${String(time.hours).padStart(2, "0")}:${String(time.minutes).padStart(2, "0")}:00`
		: "T23:59:59";
	const instant = Date.parse(`${ubDate}${timeSuffix}${UB_OFFSET}`);
	if (Number.isNaN(instant)) {
		return null;
	}
	return instant;
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

type FingerprintableTransaction = {
	tranDate?: string;
	time?: string;
	amount?: number;
	description?: string;
	relatedAccount?: string;
	balance?: number;
};

// Stable pre-hash identity for a Khaan transaction. Two transactions with the
// same identity produce the same fingerprint. Exported only so the eligible
// pipeline can key a Map by identity and let callers look up a match's
// fingerprint without recomputing SHA-256 (F7).
function transactionIdentity(transaction: FingerprintableTransaction): string {
	return [
		transaction.tranDate ?? "",
		transaction.time ?? "",
		String(transaction.amount ?? ""),
		transaction.description ?? "",
		transaction.relatedAccount ?? "",
		String(transaction.balance ?? ""),
	].join("|");
}

export async function khaanTransactionFingerprint(
	transaction: FingerprintableTransaction,
): Promise<string> {
	const bytes = new TextEncoder().encode(transactionIdentity(transaction));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

// Shared eligible-transaction pipeline (F3/F7). Both the DO poll and the
// admin collect path need: window-filter → fingerprint → consumed-lookup →
// eligible-filter. This runs all four steps in one pass, computing each
// fingerprint exactly once. The consumed-fingerprint lookup (a DB call) is
// injected by the caller so this module stays free of DB imports. Returns the
// eligible transactions plus an identity→fingerprint map so callers look up a
// match's fingerprint in O(1) instead of recomputing SHA-256 (F7).
export async function prepareEligibleKhaanTransactions(input: {
	transactions: KhaanTransaction[];
	paymentCreatedAtMs: number;
	getConsumedFingerprints: (
		fingerprints: string[],
	) => Promise<Set<string>>;
}): Promise<{
	eligible: KhaanTransaction[];
	fingerprintByIdentity: Map<string, string>;
}> {
	const withinWindow = filterTransactionsWithinPaymentWindow(
		input.transactions,
		input.paymentCreatedAtMs,
	);
	const fingerprintByIdentity = new Map<string, string>();
	const fingerprints = await Promise.all(
		withinWindow.map(async (transaction) => {
			const fingerprint = await khaanTransactionFingerprint(transaction);
			fingerprintByIdentity.set(transactionIdentity(transaction), fingerprint);
			return fingerprint;
		}),
	);
	const consumed = await input.getConsumedFingerprints(fingerprints);
	const eligible = withinWindow.filter(
		(_, index) => !consumed.has(fingerprints[index]),
	);
	return { eligible, fingerprintByIdentity };
}

// Look up a transaction-shaped object's fingerprint from the map built by
// prepareEligibleKhaanTransactions. Returns undefined if the object was not in
// the prepared set (e.g. a transaction outside the window). Callers that need
// a fingerprint for an unmatched object should fall back to
// khaanTransactionFingerprint.
export function fingerprintOf(
	map: Map<string, string>,
	transaction: FingerprintableTransaction,
): string | undefined {
	return map.get(transactionIdentity(transaction));
}

// Finds ALL Khaan transactions matching a payment (by paymentNumber-in-memo OR
// customer phone, AND exact amount, AND within the payment date window, AND
// not already consumed), and returns their fingerprints. Used by the admin
// manual-confirm path to record consumed transactions — the admin doesn't know
// which specific bank transaction corresponds to the payment, so we mark ALL
// plausible matches as consumed. This is conservative: a false-positive block
// routes a future legit transfer to manual review, while a false-negative
// allows a replay (money loss). Over-consumption is the safe direction.
//
// Unlike matchKhaanTransfer (which returns the first branch that matches),
// this unions paymentNumber and phone matches and dedupes by fingerprint.
//
// Takes the prepared eligible set + fingerprint map (from
// prepareEligibleKhaanTransactions) so the window/filter/fingerprint/consumed
// pipeline is not duplicated (F3) and fingerprints are not recomputed (F7).
export async function collectMatchingKhaanFingerprints(input: {
	eligible: KhaanTransaction[];
	fingerprintByIdentity: Map<string, string>;
	paymentNumber: string;
	phone: string;
	expectedAmount: number;
}): Promise<string[]> {
	const paymentNumber = input.paymentNumber.trim();
	const phone = input.phone.trim();
	const byPaymentNumber = paymentNumber
		? findMatchingKhaanTransfer({
				transactions: input.eligible,
				paymentNumber,
				expectedAmount: input.expectedAmount,
			}).matches
		: [];
	const byPhone = phone
		? findMatchingKhaanTransfer({
				transactions: input.eligible,
				paymentNumber: phone,
				expectedAmount: input.expectedAmount,
			}).matches
		: [];
	const result = new Set<string>();
	for (const match of [...byPaymentNumber, ...byPhone]) {
		const fingerprint = fingerprintOf(input.fingerprintByIdentity, match);
		// A match is always derived from an eligible transaction, so the map
		// must contain it. Fall back to a fresh compute only as a safety net.
		result.add(fingerprint ?? (await khaanTransactionFingerprint(match)));
	}
	return [...result];
}
