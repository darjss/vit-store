import { describe, expect, test } from "bun:test";
import type { KhaanTransaction } from "khaan-client";
import {
	collectMatchingKhaanFingerprints,
	filterTransactionsWithinPaymentWindow,
	isTransactionWithinPaymentWindow,
	khaanTransactionFingerprint,
	matchKhaanTransfer,
} from "./match-transfer";

const PHONE = "99112233";
const PAYMENT_NUMBER = "PAYABC1234";

const transaction = (
	overrides: Partial<KhaanTransaction> = {},
): KhaanTransaction => ({
	tranDate: "2026-06-28T00:00:00Z",
	time: "18:30",
	amount: 125000,
	description: `transfer ${PHONE}`,
	balance: 21167.84,
	...overrides,
});

describe("matchKhaanTransfer", () => {
	test("matches an incoming transfer by the customer phone", () => {
		const result = matchKhaanTransfer({
			transactions: [
				transaction({ description: "other" }),
				transaction({ description: `orders ${PHONE} thank you` }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});

		expect(result.status).toBe("matched");
		if (result.status === "matched") {
			expect(result.match.amount).toBe(125000);
			expect(result.match.description).toContain(PHONE);
		}
	});

	test("falls back to the payment number when the phone is absent", () => {
		const result = matchKhaanTransfer({
			transactions: [
				transaction({ description: "unrelated 100000" }),
				transaction({ description: `paid ${PAYMENT_NUMBER}` }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});

		expect(result.status).toBe("matched");
		if (result.status === "matched") {
			expect(result.match.description).toContain(PAYMENT_NUMBER);
		}
	});

	test("rejects wrong amount and outgoing transactions", () => {
		const result = matchKhaanTransfer({
			transactions: [
				transaction({ amount: 124999 }),
				transaction({ amount: -125000 }),
				transaction({ description: "no identifiers here" }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});

		expect(result).toEqual({ status: "none", matches: [] });
	});

	test("never matches on empty phone or payment number tokens", () => {
		const result = matchKhaanTransfer({
			transactions: [transaction({ description: "anything at all" })],
			paymentNumber: " ",
			phone: "",
			expectedAmount: 125000,
		});

		expect(result).toEqual({ status: "none", matches: [] });
	});

	test("marks multiple plausible transfers as ambiguous", () => {
		const result = matchKhaanTransfer({
			transactions: [
				transaction({ description: `${PHONE} first` }),
				transaction({ description: `${PHONE} second` }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});

		expect(result.status).toBe("ambiguous");
		if (result.status === "ambiguous") {
			expect(result.matches).toHaveLength(2);
		}
	});

	test("prefers the payment-number match over a phone match", () => {
		const result = matchKhaanTransfer({
			transactions: [
				transaction({ description: `transfer ${PHONE}` }),
				transaction({ description: `paid ${PAYMENT_NUMBER}` }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});

		expect(result.status).toBe("matched");
		if (result.status === "matched") {
			expect(result.match.description).toContain(PAYMENT_NUMBER);
			expect(result.match.description).not.toContain(PHONE);
		}
	});
});

describe("payment-date window", () => {
	// transaction() has tranDate "2026-06-28T00:00:00Z" + time "18:30", which
	// is 18:30 Ulaanbaatar = 10:30 UTC. The window check compares this true
	// UTC instant against the UTC payment-createdAt.
	const txInstant = Date.parse("2026-06-28T10:30:00Z");

	test("includes a transfer exactly on the skew boundary", () => {
		const createdAtMs = txInstant + 10 * 60 * 1000;
		expect(
			isTransactionWithinPaymentWindow(transaction(), createdAtMs),
		).toBe(true);
	});

	test("excludes a transfer one millisecond past the skew boundary", () => {
		const createdAtMs = txInstant + 10 * 60 * 1000 + 1;
		expect(
			isTransactionWithinPaymentWindow(transaction(), createdAtMs),
		).toBe(false);
	});

	test("excludes a transaction with a missing date", () => {
		expect(
			isTransactionWithinPaymentWindow(
				transaction({ tranDate: undefined }),
				txInstant,
			),
		).toBe(false);
	});

	test("excludes a transaction with an unparseable date", () => {
		expect(
			isTransactionWithinPaymentWindow(
				transaction({ tranDate: "not-a-date" }),
				txInstant,
			),
		).toBe(false);
	});

	test("a stale replay from days ago is filtered out before matching", () => {
		// Payment created 18:00 UB Jun 28 = 10:00 UTC Jun 28.
		const createdAtMs = Date.parse("2026-06-28T10:00:00Z");
		const stale = transaction({
			tranDate: "2026-06-20T00:00:00Z",
			description: `transfer ${PHONE}`,
		});
		const fresh = transaction({ description: `transfer ${PHONE}` });

		const eligible = filterTransactionsWithinPaymentWindow(
			[stale, fresh],
			createdAtMs,
		);
		expect(eligible).toEqual([fresh]);

		const staleOnly = matchKhaanTransfer({
			transactions: filterTransactionsWithinPaymentWindow(
				[stale],
				createdAtMs,
			),
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
		});
		expect(staleOnly).toEqual({ status: "none", matches: [] });
	});

	test("UB timezone: a 09:00 UB (01:00 UTC) transfer is excluded against a same-afternoon payment", () => {
		// Transfer at 09:00 UB Jun 28 = 01:00 UTC Jun 28. Payment created at
		// 16:00 UB Jun 28 = 08:00 UTC Jun 28. The transfer is 7h older than the
		// payment; with the old UTC-midnight+local-time bug the computed
		// instant was 09:00 UTC (8h late) and passed. With the +08:00 fix the
		// instant is 01:00 UTC and is correctly excluded.
		const morningTransfer = transaction({
			tranDate: "2026-06-28T00:00:00Z",
			time: "09:00",
			description: `transfer ${PHONE}`,
		});
		const paymentCreatedAtMs = Date.parse("2026-06-28T08:00:00Z");
		expect(
			isTransactionWithinPaymentWindow(morningTransfer, paymentCreatedAtMs),
		).toBe(false);
	});

	test("UB timezone: a same-day post-payment transfer is included", () => {
		// Transfer at 18:30 UB Jun 28 = 10:30 UTC. Payment at 10:00 UTC.
		const postPaymentTransfer = transaction({
			tranDate: "2026-06-28T00:00:00Z",
			time: "18:30",
			description: `transfer ${PHONE}`,
		});
		const paymentCreatedAtMs = Date.parse("2026-06-28T10:00:00Z");
		expect(
			isTransactionWithinPaymentWindow(
				postPaymentTransfer,
				paymentCreatedAtMs,
			),
		).toBe(true);
	});

	test("missing time uses UB end-of-day (15:59:59 UTC), not next-day 07:59:59 UTC", () => {
		// tranDate Jun 7, no time. Latest instant = Jun 7 23:59:59+08:00 =
		// Jun 7 15:59:59 UTC. A payment created at Jul 7 23:30 UTC (Jul 8
		// 07:30 UB) must NOT pass — the transfer is over 31h older. The old
		// code returned Jun 7 23:59:59 UTC = Jul 8 07:59:59 UB and passed.
		const missingTime = transaction({
			tranDate: "2026-07-07T00:00:00Z",
			time: undefined,
			description: `transfer ${PHONE}`,
		});
		const paymentCreatedAtMs = Date.parse("2026-07-07T23:30:00Z");
		expect(
			isTransactionWithinPaymentWindow(missingTime, paymentCreatedAtMs),
		).toBe(false);
	});

	test("missing time still admits a legit same-UB-day transfer", () => {
		// tranDate Jun 28, no time → latest instant Jun 28 15:59:59 UTC.
		// Payment created Jun 28 15:00 UTC (23:00 UB). A same-day transfer
		// (any time that UB day) could be as late as 15:59:59 UTC, so it
		// passes the window.
		const missingTime = transaction({
			tranDate: "2026-06-28T00:00:00Z",
			time: undefined,
			description: `transfer ${PHONE}`,
		});
		const paymentCreatedAtMs = Date.parse("2026-06-28T15:00:00Z");
		expect(
			isTransactionWithinPaymentWindow(missingTime, paymentCreatedAtMs),
		).toBe(true);
	});
});

describe("khaanTransactionFingerprint", () => {
	test("is a deterministic 64-char sha256 hex digest", async () => {
		const tx = transaction();
		const a = await khaanTransactionFingerprint(tx);
		const b = await khaanTransactionFingerprint(tx);
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	test("balance disambiguates otherwise-identical same-minute transfers", async () => {
		const base = transaction({ balance: 21167.84 });
		const dup = transaction({ balance: 30000.0 });
		expect(await khaanTransactionFingerprint(base)).not.toBe(
			await khaanTransactionFingerprint(dup),
		);
	});
});

describe("collectMatchingKhaanFingerprints (admin-confirm path, P0-1)", () => {
	// Payment created 18:00 UB Jun 28 = 10:00 UTC Jun 28.
	const paymentCreatedAtMs = Date.parse("2026-06-28T10:00:00Z");

	test("returns fingerprints for ALL matching transactions (paymentNumber + phone union)", async () => {
		const txByPaymentNumber = transaction({
			description: `paid ${PAYMENT_NUMBER}`,
		});
		const txByPhone = transaction({
			description: `transfer ${PHONE}`,
			balance: 99999.0,
		});
		const unrelated = transaction({ description: "other" });

		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [txByPaymentNumber, txByPhone, unrelated],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set(),
		});

		expect(fingerprints).toHaveLength(2);
		expect(fingerprints).toContain(
			await khaanTransactionFingerprint(txByPaymentNumber),
		);
		expect(fingerprints).toContain(
			await khaanTransactionFingerprint(txByPhone),
		);
	});

	test("dedupes a transaction that matches both paymentNumber and phone", async () => {
		// Same tx has both the payment number and the phone in its description.
		const txBoth = transaction({
			description: `${PAYMENT_NUMBER} ${PHONE}`,
		});

		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [txBoth],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set(),
		});

		expect(fingerprints).toHaveLength(1);
	});

	test("excludes already-consumed transactions", async () => {
		const tx = transaction({ description: `transfer ${PHONE}` });
		const fp = await khaanTransactionFingerprint(tx);

		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [tx],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set([fp]),
		});

		expect(fingerprints).toEqual([]);
	});

	test("excludes stale transactions outside the payment window", async () => {
		const stale = transaction({
			tranDate: "2026-06-20T00:00:00Z",
			description: `transfer ${PHONE}`,
		});
		const fresh = transaction({ description: `transfer ${PHONE}` });

		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [stale, fresh],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set(),
		});

		expect(fingerprints).toHaveLength(1);
		expect(fingerprints).toContain(
			await khaanTransactionFingerprint(fresh),
		);
	});

	test("returns [] when no transactions match (admin proceeds without fingerprints)", async () => {
		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [
				transaction({ description: "unrelated", amount: 999 }),
			],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set(),
		});

		expect(fingerprints).toEqual([]);
	});

	test("returns [] when the transaction list is empty", async () => {
		const fingerprints = await collectMatchingKhaanFingerprints({
			transactions: [],
			paymentNumber: PAYMENT_NUMBER,
			phone: PHONE,
			expectedAmount: 125000,
			paymentCreatedAtMs,
			consumedFingerprints: new Set(),
		});

		expect(fingerprints).toEqual([]);
	});
});
