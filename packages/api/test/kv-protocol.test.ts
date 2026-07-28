import { describe, expect, test } from "bun:test";
import { checkoutAccessTokenRecordSchema } from "../src/lib/session/protocol";
import * as v from "valibot";

describe("KV protocol validation", () => {
	test("accepts a strict checkout token record", () => {
		expect(
			v.safeParse(checkoutAccessTokenRecordSchema, {
				orderId: 12,
				orderNumber: "ORD-12",
				paymentNumber: "PAY-12",
				phone: 99112233,
				tokenHash: "hash",
			}).success,
		).toBe(true);
	});

	test("rejects malformed and extended checkout token records", () => {
		expect(
			v.safeParse(checkoutAccessTokenRecordSchema, {
				orderId: "12",
				orderNumber: "ORD-12",
				paymentNumber: "PAY-12",
				phone: 99112233,
				tokenHash: "hash",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(checkoutAccessTokenRecordSchema, {
				orderId: 12,
				orderNumber: "ORD-12",
				paymentNumber: "PAY-12",
				phone: 99112233,
				tokenHash: "hash",
				rawToken: "must-not-pass",
			}).success,
		).toBe(false);
	});
});
