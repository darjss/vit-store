import { describe, expect, test } from "bun:test";
import { planPaymentTransition } from "./order-transition";

describe("planPaymentTransition — updateOrder sales/stock transition semantics", () => {
	test("transition pending → success: records sale and deducts full stock", () => {
		const plan = planPaymentTransition("pending", "success");
		expect(plan.transitionedToSuccess).toBe(true);
		expect(plan.shouldRecordSale).toBe(true);
		expect(plan.shouldDeductFullStock).toBe(true);
	});

	test("transition customer_claimed_paid → success: records sale and deducts full stock", () => {
		const plan = planPaymentTransition("customer_claimed_paid", "success");
		expect(plan.transitionedToSuccess).toBe(true);
		expect(plan.shouldRecordSale).toBe(true);
		expect(plan.shouldDeductFullStock).toBe(true);
	});

	test("repeat save success → success: no sale, no full stock deduction (idempotent)", () => {
		const plan = planPaymentTransition("success", "success");
		expect(plan.transitionedToSuccess).toBe(false);
		expect(plan.shouldRecordSale).toBe(false);
		expect(plan.shouldDeductFullStock).toBe(false);
	});

	test("no transition pending → pending: no sale, no stock deduction", () => {
		const plan = planPaymentTransition("pending", "pending");
		expect(plan.transitionedToSuccess).toBe(false);
		expect(plan.shouldRecordSale).toBe(false);
		expect(plan.shouldDeductFullStock).toBe(false);
	});

	test("no transition failed → pending: no sale, no stock deduction", () => {
		const plan = planPaymentTransition("failed", "pending");
		expect(plan.transitionedToSuccess).toBe(false);
		expect(plan.shouldRecordSale).toBe(false);
		expect(plan.shouldDeductFullStock).toBe(false);
	});

	test("transition undefined → success (no prior payment): records sale and deducts stock", () => {
		const plan = planPaymentTransition(undefined, "success");
		expect(plan.transitionedToSuccess).toBe(true);
		expect(plan.shouldRecordSale).toBe(true);
		expect(plan.shouldDeductFullStock).toBe(true);
	});

	test("reversal success → pending: no sale, no stock deduction (not a transition into success)", () => {
		const plan = planPaymentTransition("success", "pending");
		expect(plan.transitionedToSuccess).toBe(false);
		expect(plan.shouldRecordSale).toBe(false);
		expect(plan.shouldDeductFullStock).toBe(false);
	});
});
