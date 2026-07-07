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
export function planPaymentTransition(
	prevPaymentStatus: string | undefined,
	newPaymentStatus: string,
): {
	transitionedToSuccess: boolean;
	wasSuccess: boolean;
	shouldRecordSale: boolean;
	shouldDeductFullStock: boolean;
	shouldAdjustStockDiff: boolean;
} {
	const wasSuccess = prevPaymentStatus === "success";
	const transitionedToSuccess =
		!wasSuccess && newPaymentStatus === "success";
	return {
		transitionedToSuccess,
		wasSuccess,
		shouldRecordSale: transitionedToSuccess,
		shouldDeductFullStock: transitionedToSuccess,
		shouldAdjustStockDiff: wasSuccess && !transitionedToSuccess,
	};
}
