import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export {
	formatCurrency,
	formatDateToText,
	getPaymentProviderIcon,
	getPaymentStatusColor,
	getStatusColor,
	getStockColor,
} from "@vit/shared";

export function cn(...inputs: Array<ClassValue>) {
	return twMerge(clsx(inputs));
}

export const getRevenueData = (selectedPeriod: "daily" | "weekly" | "monthly") => {
	switch (selectedPeriod) {
		case "daily":
			return [
				{ date: "00:00", revenue: 420_000 },
				{ date: "04:00", revenue: 380_000 },
				{ date: "08:00", revenue: 510_000 },
				{ date: "12:00", revenue: 460_000 },
				{ date: "16:00", revenue: 620_000 },
				{ date: "20:00", revenue: 580_000 },
				{ date: "23:59", revenue: 710_000 },
			];
		case "weekly":
			return [
				{ date: "Дүү", revenue: 4_200_000 },
				{ date: "Мяг", revenue: 3_800_000 },
				{ date: "Лха", revenue: 5_100_000 },
				{ date: "Пүр", revenue: 4_600_000 },
				{ date: "Баа", revenue: 6_200_000 },
				{ date: "Бям", revenue: 5_800_000 },
				{ date: "Ня", revenue: 7_100_000 },
			];
		case "monthly":
			return [
				{ date: "1-р 7 хоног", revenue: 15_200_000 },
				{ date: "2-р 7 хоног", revenue: 16_800_000 },
				{ date: "3-р 7 хоног", revenue: 14_500_000 },
				{ date: "4-р 7 хоног", revenue: 22_000_000 },
			];
	}
};
