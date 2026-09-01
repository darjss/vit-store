/**
 * Pure transition planner for payment-status changes in updateOrder.
 *
 * Invariant: each order line's stock is deducted EXACTLY ONCE, when
 * payment transitions to success. This matches addOrder (deducts on
 * creation with paymentStatus==="success") and confirmPaymentAndApplyStock
 * (deducts on transition to success). Pending orders never touch stock.
 *
 * - transitionedToSuccess: first-time deduction for ALL products + sales.
 * - wasSuccess && !transitioned: already-paid order being edited — adjust
 *   diffs only (quantityDiff for existing lines, full for new lines added
 *   after success, restore for removed lines).
 * - !wasSuccess && !transitioned: pending/other — no stock changes at all.
 */
export type PaymentTransitionPlan = {
	shouldAdjustStockDiff: boolean;
	shouldDeductFullStock: boolean;
	shouldRecordSale: boolean;
	transitionedToSuccess: boolean;
	wasSuccess: boolean;
};

export function planPaymentTransition(
	prevPaymentStatus: string | undefined,
	newPaymentStatus: string,
): PaymentTransitionPlan {
	const wasSuccess = prevPaymentStatus === "success";
	const transitionedToSuccess = !wasSuccess && newPaymentStatus === "success";
	return {
		shouldAdjustStockDiff: wasSuccess && !transitionedToSuccess,
		shouldDeductFullStock: transitionedToSuccess,
		shouldRecordSale: transitionedToSuccess,
		transitionedToSuccess,
		wasSuccess,
	} satisfies PaymentTransitionPlan;
}
