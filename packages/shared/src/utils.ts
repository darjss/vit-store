import { orderStatusLabels, orderStatusStyles } from "./order-status";
import type { OrderStatusType } from "./types/order";

export const getStatusColor = (status: string) => {
	switch (status) {
		case "ACTIVE":
			return "bg-[#00ff88] text-black border-black";
		case "OUT_OF_STOCK":
			return "bg-[#ff4757] text-white border-black";
		case "DISCONTINUED":
			return "bg-[#2c2c54] text-white border-black";
		default:
			return "bg-[#ff6b35] text-black border-black";
	}
};

export const getStockColor = (stock: number) => {
	if (stock > 10) {
		return "text-[#00ff88]";
	}
	if (stock > 0) {
		return "text-[#ffa502]";
	}
	return "text-[#ff4757]";
};
export const getPaymentStatusColor = (status: string) => {
	switch (status) {
		case "success":
			return "border-[#059669] bg-[#d1fae5] text-[#064e3b]";
		case "pending":
			return "border-[#64748b] bg-[#f1f5f9] text-[#334155]";
		case "customer_claimed_paid":
			return "border-[#ea580c] bg-[#ffedd5] text-[#7c2d12]";
		case "failed":
			return "border-[#dc2626] bg-[#fee2e2] text-[#7f1d1d]";
		default:
			return "border-[#64748b] bg-[#f1f5f9] text-[#334155]";
	}
};

export const getPaymentProviderIcon = (provider: string) => {
	switch (provider.toLowerCase()) {
		case "qpay":
			return "📱";
		case "cash":
			return "💵";
		case "transfer":
			return "🏦";
		default:
			return "💳";
	}
};
export function formatCurrency(amount: number): string {
	return `${amount.toLocaleString()}₮`;
}

const isOrderStatusType = (status: string): status is OrderStatusType =>
	status in orderStatusLabels;

export const getOrderStatusStyles = (status: string) => {
	const normalized = status.toLowerCase() === "canceled" ? "cancelled" : status.toLowerCase();
	const key = isOrderStatusType(normalized) ? normalized : null;
	const styles = key ? orderStatusStyles[key] : undefined;
	return (
		styles ?? {
			badge: "border-black bg-[#5f27cd] text-white",
			border: "border-l-[#5f27cd]",
		}
	);
};

export function findBrandId(
	brandName: string | null | undefined,
	brands: Array<{ id: number; name: string }>,
): number {
	if (!brandName) {
		return 0;
	}
	const brand = brands.find((b) => b.name.toLowerCase() === brandName.toLowerCase());
	return brand?.id || 0;
}

function pad(n: number) {
	return n.toString().padStart(2, "0");
}

export function formatDateToText(d: Date, now = new Date()): string {
	const startOfDay = (dt: Date) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
	const msPerDay = 24 * 60 * 60 * 1000;

	const dayDiff = Math.floor((startOfDay(now).getTime() - startOfDay(d).getTime()) / msPerDay);

	const hh = pad(d.getHours());
	const mm = pad(d.getMinutes());
	const ss = pad(d.getSeconds());
	const time = `${hh}:${mm}:${ss}`;

	if (dayDiff === 0) {
		return `өнөөдөр ${time}`;
	}
	if (dayDiff === 1) {
		return `өчигдөр ${time}`;
	}

	const yyyy = d.getFullYear();
	const mmth = pad(d.getMonth() + 1);
	const dd = pad(d.getDate());
	const datePart = `${yyyy}-${mmth}-${dd}`;

	return `${datePart} ${time}`;
}
