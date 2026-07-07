import { describe, expect, test } from "bun:test";
import type { KhaanTransaction } from "khaan-client";
import {
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
	const txInstant = Date.parse("2026-06-28T18:30:00Z");

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
		const createdAtMs = Date.parse("2026-06-28T18:00:00Z");
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
