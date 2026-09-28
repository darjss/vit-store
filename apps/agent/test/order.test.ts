import { describe, expect, test } from "bun:test";
import type { CheckoutOrderPayload } from "@vit/assistant";
import { createOrderWithMutation } from "../src/lib/order";

const payload: CheckoutOrderPayload = {
	phoneNumber: "99112233",
	address: "Баянзүрх дүүрэг",
	addressZoneId: 1,
	products: [{ productId: 10, quantity: 2 }],
	idempotencyKey: "checkout_00000000-0000-4000-8000-000000000001",
};

const created = {
	paymentNumber: "PAY1",
	orderNumber: "OR1",
	checkoutToken: "token-1",
	total: 46_000,
	customerPhone: "99112233",
	accountNumber: "1234567890",
	accountName: "Amerik Vitamin",
};

describe("assistant order v2 adapter", () => {
	test("deserializes a successful Result and preserves the idempotency key", async () => {
		let received: CheckoutOrderPayload | undefined;
		const result = await createOrderWithMutation(payload, async (input) => {
			received = input;
			return { status: "ok", value: created };
		});

		expect(received?.idempotencyKey).toBe(payload.idempotencyKey);
		expect(result.status).toBe("ok");
		if (result.status === "ok") {
			expect(result.value).toEqual({
				orderNumber: "OR1",
				paymentNumber: "PAY1",
				checkoutToken: "token-1",
			});
		}
	});

	test("maps a recovery Result to a safe retry", async () => {
		const result = await createOrderWithMutation(payload, async () => ({
			status: "error",
			error: {
				_tag: "CheckoutRecoveryRequired",
				message:
					"Захиалга үүссэн боловч үргэлжлүүлэх холбоосыг бэлтгэж чадсангүй.",
				orderNumber: "OR1",
			},
		}));

		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error).toEqual({
				_tag: "OrderCreationFailed",
				retryable: true,
				recovery: { _tag: "Retry" },
			});
		}
	});
});
