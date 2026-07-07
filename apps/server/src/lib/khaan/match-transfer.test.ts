import { describe, expect, test } from "bun:test";
import type { KhaanTransaction } from "khaan-client";
import { matchKhaanTransfer } from "./match-transfer";

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
});
