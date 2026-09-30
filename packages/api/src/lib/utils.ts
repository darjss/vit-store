import {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "@vit/shared/constants";
import type { timeRangeType } from "@vit/shared/schema";
import type {
	OrderDeliveryProviderType,
	OrderStatusType,
	PaymentProviderType,
	PaymentStatusType,
} from "@vit/shared/types";
import { customAlphabet } from "nanoid";

export { deliveryProvider, orderStatus, paymentProvider, paymentStatus };

export const percentile = (sortedValues: Array<number>, p: number): number => {
	if (sortedValues.length === 0) {
		return 0;
	}

	const index = Math.ceil((p / 100) * sortedValues.length) - 1;
	return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
};

export const summarizeTimings = (values: Array<number>) => {
	if (values.length === 0) {
		return {
			count: 0,
			max: 0,
			mean: 0,
			min: 0,
			p50: 0,
			p95: 0,
		};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const sum = values.reduce((acc, value) => acc + value, 0);

	return {
		count: values.length,
		max: sorted.at(-1) ?? 0,
		mean: sum / values.length,
		min: sorted[0] ?? 0,
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
	};
};

export const measureMs = async (fn: () => Promise<void>): Promise<number> => {
	const startedAt = performance.now();
	await fn();
	return performance.now() - startedAt;
};

export const generateOrderNumber = () => {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const nanoId = customAlphabet(alphabet);
	return nanoId(8);
};

export const generatePaymentNumber = () => {
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	const nanoId = customAlphabet(alphabet);
	return nanoId(10);
};

// Asia/Ulaanbaatar is UTC+8 with no DST. Compute day boundaries at UB midnight
// without relying on runtime-local time (Workers run in UTC).
export const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Returns the UTC Date corresponding to midnight (00:00:00) at the start of the
// current day in Asia/Ulaanbaatar.
export const getStartOfDay = () => {
	const nowMs = Date.now();
	const ubDayStartMs = Math.floor((nowMs + UB_OFFSET_MS) / DAY_MS) * DAY_MS - UB_OFFSET_MS;
	return new Date(ubDayStartMs);
};

// Returns the UTC Date corresponding to midnight (00:00:00) at the start of the
// day `days` ago in Asia/Ulaanbaatar.
export const getDaysAgo = (days: number) => {
	const startOfTodayUb = getStartOfDay();
	return new Date(startOfTodayUb.getTime() - days * DAY_MS);
};
export const getStartAndEndofDayAgo = (days: number) => {
	const startDate = getDaysAgo(days);
	const endDate = new Date(startDate.getTime() + DAY_MS - 1);
	return { endDate, startDate };
};
export const calculateExpiration = (timerange: timeRangeType) => {
	switch (timerange) {
		case "daily":
			return 12 * 60 * 60;
		case "weekly":
			return 24 * 60 * 60;
		case "monthly":
			return 3 * 24 * 60 * 60;
		default:
			return 24 * 60 * 60;
	}
};

export const slugify = (text: string): string => {
	return text
		.toLowerCase()
		.replaceAll(/[^a-z0-9\u0400-\u04FF]+/g, "-")
		.replaceAll(/^-+|-+$/g, "");
};

export const getTtlForTimeRange = (timeRange?: timeRangeType) => {
	switch (timeRange) {
		case "daily":
			return 60 * 60;
		case "weekly":
			return 60 * 60 * 24;
		case "monthly":
			return 60 * 60 * 24 * 7;
		default:
			return 300;
	}
};

export const getDaysFromTimeRange = (timerange: timeRangeType) => {
	let startDate: Date;
	switch (timerange) {
		case "daily":
			startDate = getStartOfDay();
			break;
		case "weekly":
			startDate = getDaysAgo(7);
			break;
		case "monthly":
			startDate = getDaysAgo(30);
			break;
		default:
			startDate = getStartOfDay();
	}
	return startDate;
};

interface OrderResult {
	address: string;
	addressZoneId: number | null;
	createdAt: Date;
	customerPhone: number;
	deliveryProvider: OrderDeliveryProviderType;
	id: number;
	notes: string | null;
	orderDetails: Array<{
		price: number | null;
		product: {
			id: number;
			images: Array<{
				url: string;
			}>;
			name: string;
			price: number;
		};
		quantity: number;
	}>;
	orderNumber: string;
	payments: Array<{
		createdAt: Date;
		paymentNumber: string;
		provider: PaymentProviderType;
		status: PaymentStatusType;
	}>;
	status: OrderStatusType;
	total: number;
	updatedAt: Date | null;
}

export const projectOrderResult = (result: OrderResult) => {
	result.payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	const latestPayment = result.payments[0];
	return {
		address: result.address,
		addressZoneId: result.addressZoneId ?? undefined,
		createdAt: result.createdAt,
		customerPhone: `${result.customerPhone}`,
		deliveryProvider: result.deliveryProvider,
		id: result.id,
		notes: result.notes,
		orderNumber: result.orderNumber,
		paymentNumber: latestPayment?.paymentNumber,
		paymentProvider: latestPayment?.provider ?? "transfer",
		paymentStatus: latestPayment?.status ?? "pending",
		products: result.orderDetails.map((orderDetail) => ({
			imageUrl: orderDetail.product.images[0]?.url,
			name: orderDetail.product.name,
			price: orderDetail.price ?? orderDetail.product.price,
			productId: orderDetail.product.id,
			quantity: orderDetail.quantity,
		})),
		status: result.status,
		total: result.total,
		updatedAt: result.updatedAt,
	};
};
export const projectOrderResults = (results: Array<OrderResult>) => {
	return results?.map((result) => {
		result.payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		const latestPayment = result.payments[0];
		return {
			address: result.address,
			addressZoneId: result.addressZoneId ?? undefined,
			createdAt: result.createdAt,
			customerPhone: `${result.customerPhone}`,
			deliveryProvider: result.deliveryProvider,
			id: result.id,
			notes: result.notes,
			orderNumber: result.orderNumber,
			paymentNumber: latestPayment?.paymentNumber,
			paymentProvider: latestPayment?.provider ?? "transfer",
			paymentStatus: latestPayment?.status ?? "pending",
			products: result.orderDetails.map((orderDetail) => ({
				imageUrl: orderDetail.product.images[0]?.url,
				name: orderDetail.product.name,
				price: orderDetail.price ?? orderDetail.product.price,
				productId: orderDetail.product.id,
				quantity: orderDetail.quantity,
			})),
			status: result.status,
			total: result.total,
			updatedAt: result.updatedAt,
		};
	});
};
