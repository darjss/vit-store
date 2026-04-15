import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export {
	formatCurrency,
	formatDateToText,
	getOrderStatusStyles,
	getPaymentProviderIcon,
	getPaymentStatusColor,
	getStatusColor,
	getStockColor,
} from "@vit/shared";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
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
