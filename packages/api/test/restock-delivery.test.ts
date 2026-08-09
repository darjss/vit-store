import { describe, expect, test } from "bun:test";
import { shouldRetryRestockDelivery } from "../src/lib/restock/delivery-core";

describe("restock delivery retry safety", () => {
	test("does not retry an email after an ambiguous provider call", () => {
		expect(
			shouldRetryRestockDelivery({
				channel: "email",
				providerResult: "ambiguous",
			}),
		).toBe(false);
	});

	test("retries an email only after a definite provider failure", () => {
		expect(
			shouldRetryRestockDelivery({
				channel: "email",
				providerResult: "failed",
			}),
		).toBe(true);
		expect(
			shouldRetryRestockDelivery({
				channel: "sms",
				providerResult: "failed",
			}),
		).toBe(false);
	});
});
