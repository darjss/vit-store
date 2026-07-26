import type { OrderStatusType } from "./types/order";

/**
 * Canonical Mongolian labels for order statuses. Single source of truth —
 * import this instead of hand-copying the map. Used by admin and storefront.
 */
export const orderStatusLabels: Record<OrderStatusType, string> = {
	created: "Төлбөр хүлээж буй",
	pending: "Илгээхэд бэлэн",
	shipped: "Хүргэлтэд гарсан",
	delivered: "Хүргэгдсэн",
	cancelled: "Цуцлагдсан",
	refunded: "Буцаан олгосон",
};

/**
 * Canonical badge color classes per order status. Single source of truth.
 * `badge` is the background/text class, `border` is the left-border accent.
 */
export const orderStatusStyles: Record<
	OrderStatusType,
	{ badge: string; border: string }
> = {
	created: {
		badge: "border-[#64748b] bg-[#e2e8f0] text-[#0f172a]",
		border: "border-l-[#64748b]",
	},
	pending: {
		badge: "border-[#d97706] bg-[#fef3c7] text-[#78350f]",
		border: "border-l-[#d97706]",
	},
	shipped: {
		badge: "border-[#2563eb] bg-[#dbeafe] text-[#1e3a8a]",
		border: "border-l-[#2563eb]",
	},
	delivered: {
		badge: "border-[#059669] bg-[#d1fae5] text-[#064e3b]",
		border: "border-l-[#059669]",
	},
	cancelled: {
		badge: "border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d]",
		border: "border-l-[#dc2626]",
	},
	refunded: {
		badge: "border-[#7c3aed] bg-[#ede9fe] text-[#4c1d95]",
		border: "border-l-[#7c3aed]",
	},
};
