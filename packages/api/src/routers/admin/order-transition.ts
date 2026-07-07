/**
 * Pure transition planner for payment-status changes in updateOrder.
 *
 * Sales rows and the initial stock deduction are applied ONLY when the
 * payment transitions INTO "success". Repeat saves that keep
 * "success" are no-ops for sales/stock (idempotent), matching the
 * semantics of `confirmPaymentAndApplyStock` (transfer-confirmation.ts).
 */
export function planPaymentTransition(
	prevPaymentStatus: string | undefined,
	newPaymentStatus: string,
): {
	transitionedToSuccess: boolean;
	shouldRecordSale: boolean;
	shouldDeductFullStock: boolean;
} {
	const transitionedToSuccess =
		prevPaymentStatus !== "success" && newPaymentStatus === "success";
	return {
		transitionedToSuccess,
		shouldRecordSale: transitionedToSuccess,
		shouldDeductFullStock: transitionedToSuccess,
	};
}
