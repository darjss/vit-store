import { describe, expect, test } from "bun:test";
import { classifyResendError } from "../src/lib/integrations/resend/client";
import { classifyOrderConfirmationSmsState } from "../src/lib/payments/order-confirmation-sms";
import { classifyRestockSmsState } from "../src/lib/restock/send";

describe("background delivery adapters", () => {
	test("classifies all order confirmation SMS states", () => {
		expect(classifyOrderConfirmationSmsState("Sent").status).toBe("ok");
		expect(classifyOrderConfirmationSmsState("Delivered").status).toBe("ok");
		for (const state of ["Pending", "Processed"] as const) {
			const result = classifyOrderConfirmationSmsState(state);
			expect(result.status).toBe("error");
			if (result.status === "error") {
				expect(result.error._tag).toBe("AmbiguousDelivery");
			}
		}
		const failed = classifyOrderConfirmationSmsState("Failed");
		expect(failed.status).toBe("error");
		if (failed.status === "error") {
			expect(failed.error._tag).toBe("RetryableDeliveryFailure");
		}
	});

	test("treats an acknowledged restock SMS as accepted", () => {
		for (const state of [
			"Pending",
			"Processed",
			"Sent",
			"Delivered",
		] as const) {
			const result = classifyRestockSmsState({ id: "sms-1", state });
			expect(result.status).toBe("ok");
		}
		const failed = classifyRestockSmsState({ id: "sms-1", state: "Failed" });
		expect(failed.status).toBe("error");
		if (failed.status === "error") {
			expect(failed.error._tag).toBe("RetryableDeliveryFailure");
		}
	});

	test("distinguishes Resend retryable, invalid, and permanent errors", () => {
		expect(
			classifyResendError({
				name: "rate_limit_exceeded",
				message: "provider detail",
			})._tag,
		).toBe("RetryableDeliveryFailure");
		expect(
			classifyResendError({
				name: "invalid_parameter",
				message: "provider detail",
			})._tag,
		).toBe("InvalidDelivery");
		expect(
			classifyResendError({
				name: "invalid_access",
				message: "provider detail",
			})._tag,
		).toBe("PermanentDeliveryFailure");
	});
});
