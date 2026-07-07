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

	test("already-success edits adjust diffs, not full deduction", () => {
		const plan = planPaymentTransition("success", "success");
		expect(plan.wasSuccess).toBe(true);
		expect(plan.shouldAdjustStockDiff).toBe(true);
		expect(plan.shouldDeductFullStock).toBe(false);
	});

	test("pending edits do not adjust diffs or deduct stock", () => {
		const plan = planPaymentTransition("pending", "pending");
		expect(plan.wasSuccess).toBe(false);
		expect(plan.shouldAdjustStockDiff).toBe(false);
		expect(plan.shouldDeductFullStock).toBe(false);
	});
});

describe("planPaymentTransition — multi-save scenario: pending → add B → flip to success", () => {
	// Scenario: pending order with product A. Edit 1 adds product B (stays
	// pending). Edit 2 flips payment to success. Product B must be deducted
	// exactly once total — on edit 2 (the transition), not edit 1.
	test("edit 1 (pending → pending, add B): no deduction for B", () => {
		const plan1 = planPaymentTransition("pending", "pending");
		expect(plan1.shouldDeductFullStock).toBe(false);
		expect(plan1.shouldAdjustStockDiff).toBe(false);
	});

	test("edit 2 (pending → success): full deduction for ALL products including B", () => {
		const plan2 = planPaymentTransition("pending", "success");
		expect(plan2.shouldDeductFullStock).toBe(true);
		expect(plan2.shouldRecordSale).toBe(true);
	});

	test("B deducted exactly once across both saves", () => {
		const plan1 = planPaymentTransition("pending", "pending");
		const plan2 = planPaymentTransition("pending", "success");
		const totalDeductionsForB =
			(plan1.shouldDeductFullStock ? 1 : 0) +
			(plan2.shouldDeductFullStock ? 1 : 0);
		expect(totalDeductionsForB).toBe(1);
	});
});
