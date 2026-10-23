import { describe, expect, mock, test } from "bun:test";
import * as v from "valibot";

mock.module("cloudflare:workers", () => ({
	env: {
		QPAY_PASSWORD: "test",
		QPAY_URL: "https://merchant.qpay.mn",
		QPAY_USERNAME: "test",
		vitStoreKV: { get: async () => null, put: async () => undefined },
	},
}));

const { paymentResponseSchema } = await import("./qpay");

describe("paymentResponseSchema", () => {
	test("parses an unpaid invoice poll that omits paid_amount and rows", () => {
		const parsed = v.parse(paymentResponseSchema, { count: 0 });
		expect(parsed).toEqual({ count: 0, paid_amount: 0, rows: [] });
	});

	test("parses an unpaid invoice poll that omits only paid_amount", () => {
		const parsed = v.parse(paymentResponseSchema, { count: 0, rows: [] });
		expect(parsed.paid_amount).toBe(0);
		expect(parsed.rows).toEqual([]);
	});

	test("parses a paid invoice poll with a payment row", () => {
		const parsed = v.parse(paymentResponseSchema, {
			count: 1,
			paid_amount: 231_000,
			rows: [
				{
					card_transactions: [],
					next_payment_date: null,
					next_payment_datetime: null,
					p2p_transactions: [],
					payment_amount: "231000",
					payment_currency: "MNT",
					payment_id: "pay_1",
					payment_status: "PAID",
					payment_type: "CARD",
					payment_wallet: "qpay",
					trx_fee: "0",
				},
			],
		});
		expect(parsed.paid_amount).toBe(231_000);
		expect(parsed.rows[0]?.payment_status).toBe("PAID");
	});
});
