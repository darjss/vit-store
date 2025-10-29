import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

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
	if (stock > 10) return "text-[#00ff88]";
	if (stock > 0) return "text-[#ffa502]";
	return "text-[#ff4757]";
};
export const getPaymentStatusColor = (status: string) => {
	switch (status) {
		case "success":
			return "border-black bg-[#00ff88] text-black";
		case "pending":
			return "border-black bg-[#ffa502] text-black";
		case "failed":
			return "border-black bg-[#ff4757] text-white";
		default:
			return "border-black bg-[#5f27cd] text-white";
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
	return `${amount}₮`;
}

// Order status styles for badges and left-border colors
export const getOrderStatusStyles = (status: string) => {
	switch (status.toLowerCase()) {
		case "delivered":
			return {
				badge: "border-black bg-[#00ff88] text-black",
				border: "border-l-[#00ff88]",
			};
		case "shipped":
			return {
				badge: "border-black bg-[#3742fa] text-white",
				border: "border-l-[#3742fa]",
			};
		case "pending":
			return {
				badge: "border-black bg-[#ffa502] text-black",
				border: "border-l-[#ffa502]",
			};
		case "cancelled":
		case "canceled":
			return {
				badge: "border-black bg-[#ff4757] text-white",
				border: "border-l-[#ff4757]",
			};
		default:
			return {
				badge: "border-black bg-[#5f27cd] text-white",
				border: "border-l-[#5f27cd]",
			};
	}
};

function pad(n: number) {
	return n.toString().padStart(2, "0");
}

export function formatDateToText(d: Date, now = new Date()): string {
	const startOfDay = (dt: Date) =>
		new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
	const msPerDay = 24 * 60 * 60 * 1000;

	const dayDiff = Math.floor(
		(startOfDay(now).getTime() - startOfDay(d).getTime()) / msPerDay,
	);

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

	// const daysText = `${dayDiff} хоногийн өмнө`;

	// if (dayDiff <= 2) {
	// 	return `${daysText} ${time}`;
	// }

	const yyyy = d.getFullYear();
	const mmth = pad(d.getMonth() + 1);
	const dd = pad(d.getDate());
	const datePart = `${yyyy}-${mmth}-${dd}`;

	return `${datePart} ${time}`;
}

export const getRevenueData = (
	selectedPeriod: "daily" | "weekly" | "monthly",
) => {
	switch (selectedPeriod) {
		case "daily":
			return [
				{ date: "00:00", revenue: 420000 },
				{ date: "04:00", revenue: 380000 },
				{ date: "08:00", revenue: 510000 },
				{ date: "12:00", revenue: 460000 },
				{ date: "16:00", revenue: 620000 },
				{ date: "20:00", revenue: 580000 },
				{ date: "23:59", revenue: 710000 },
			];
		case "weekly":
			return [
				{ date: "Дүү", revenue: 4200000 },
				{ date: "Мяг", revenue: 3800000 },
				{ date: "Лха", revenue: 5100000 },
				{ date: "Пүр", revenue: 4600000 },
				{ date: "Баа", revenue: 6200000 },
				{ date: "Бям", revenue: 5800000 },
				{ date: "Ня", revenue: 7100000 },
			];
		case "monthly":
			return [
				{ date: "1-р 7 хоног", revenue: 15200000 },
				{ date: "2-р 7 хоног", revenue: 16800000 },
				{ date: "3-р 7 хоног", revenue: 14500000 },
				{ date: "4-р 7 хоног", revenue: 22000000 },
			];
	}
};
