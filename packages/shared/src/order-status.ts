import type { OrderStatusType } from "./types/order";

/**
 * Canonical Mongolian labels for order statuses. Single source of truth —
 * import this instead of hand-copying the map. Used by admin and storefront.
 */
export const orderStatusLabels: Record<OrderStatusType, string> = {
	created: "Төлөөгүй",
	pending: "Хүлээгдэж буй",
	shipped: "Илгээгдсэн",
	delivered: "Хүргэгдсэн",
	cancelled: "Цуцлагдсан",
	refunded: "Буцаагдсан",
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
		badge: "border-black bg-[#778ca3] text-white",
		border: "border-l-[#778ca3]",
	},
	pending: {
		badge: "border-black bg-[#ffa502] text-black",
		border: "border-l-[#ffa502]",
	},
	shipped: {
		badge: "border-black bg-[#3742fa] text-white",
		border: "border-l-[#3742fa]",
	},
	delivered: {
		badge: "border-black bg-[#00ff88] text-black",
		border: "border-l-[#00ff88]",
	},
	cancelled: {
		badge: "border-black bg-[#ff4757] text-white",
		border: "border-l-[#ff4757]",
	},
	refunded: {
		badge: "border-black bg-[#5f27cd] text-white",
		border: "border-l-[#5f27cd]",
	},
};
