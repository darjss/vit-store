import type { OrderStatusType } from "@vit/shared/types/order";

/**
 * Legal order-status transitions.
 *
 * Lifecycle: created (unpaid) → pending (paid, awaiting shipment) → shipped →
 * delivered → refunded. Cancellation is allowed until delivery; a cancelled
 * order is terminal (undelete goes through restoreOrder). Same-status calls
 * are treated as no-ops by the caller, not transitions.
 *
 * This is the single source of truth for quick status actions. The full-edit
 * path (updateOrder) remains an admin override and may set any status.
 */
export const ORDER_STATUS_TRANSITIONS: Record<
	OrderStatusType,
	readonly OrderStatusType[]
> = {
	created: ["pending", "cancelled"],
	pending: ["shipped", "cancelled"],
	shipped: ["delivered", "cancelled"],
	delivered: ["refunded"],
	cancelled: [],
	refunded: [],
};

export function canTransitionOrderStatus(
	from: OrderStatusType,
	to: OrderStatusType,
): boolean {
	return (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

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
