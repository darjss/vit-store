import { describe, expect, test } from "bun:test";
import type { KhaanTransaction } from "./client";
import {
	findMatchingKhaanTransfer,
	isIncomingKhaanTransaction,
} from "./reconciliation";

const transaction = (
	overrides: Partial<KhaanTransaction> = {},
): KhaanTransaction => ({
	transactionDate: "2026-06-21T10:00:00Z",
	amountType: { cmCode: "04", codeDescription: "орлого" },
	amount: { amount: 125000, currency: "MNT" },
	transactionRemarks: "PAYABC1234",
	txnTime: "10:00:00",
	...overrides,
});

describe("Khaan transfer reconciliation matching", () => {
	test("matches one incoming MNT transaction by exact amount and payment number", () => {
		const result = findMatchingKhaanTransfer({
			transactions: [
				transaction({ transactionRemarks: "other" }),
				transaction({ transactionRemarks: "payment PAYABC1234 thank you" }),
			],
			paymentNumber: "PAYABC1234",
			expectedAmount: 125000,
		});

		expect(result.status).toBe("matched");
		if (result.status === "matched") {
			expect(result.match.amount).toBe(125000);
			expect(result.match.transactionRemarks).toContain("PAYABC1234");
		}
	});

	test("rejects amount, currency, direction, and remark mismatches", () => {
		const result = findMatchingKhaanTransfer({
			transactions: [
				transaction({ amount: { amount: 124999, currency: "MNT" } }),
				transaction({ amount: { amount: 125000, currency: "USD" } }),
				transaction({
					amountType: { cmCode: "01", codeDescription: "зарлага" },
				}),
				transaction({ transactionRemarks: "customer phone 99112233" }),
			],
			paymentNumber: "PAYABC1234",
			expectedAmount: 125000,
		});

		expect(result).toEqual({ status: "none", matches: [] });
	});

	test("marks multiple plausible matches as ambiguous", () => {
		const result = findMatchingKhaanTransfer({
			transactions: [
				transaction({ transactionRemarks: "PAYABC1234 first" }),
				transaction({ transactionRemarks: "PAYABC1234 second" }),
			],
			paymentNumber: "PAYABC1234",
			expectedAmount: 125000,
		});

		expect(result.status).toBe("ambiguous");
		if (result.status === "ambiguous") {
			expect(result.matches).toHaveLength(2);
		}
	});

	test("recognizes incoming transactions by Khaan income code or description", () => {
		expect(isIncomingKhaanTransaction(transaction())).toBe(true);
		expect(
			isIncomingKhaanTransaction(
				transaction({
					amountType: { cmCode: "", codeDescription: "Credit" },
				}),
			),
		).toBe(true);
		expect(
			isIncomingKhaanTransaction(
				transaction({
					amount: { amount: -125000, currency: "MNT" },
				}),
			),
		).toBe(false);
	});
});
