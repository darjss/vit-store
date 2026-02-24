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

export const percentile = (sortedValues: number[], p: number): number => {
	if (sortedValues.length === 0) {
		return 0;
	}

	const index = Math.ceil((p / 100) * sortedValues.length) - 1;
	return (
		sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0
	);
};

export const summarizeTimings = (values: number[]) => {
	if (values.length === 0) {
		return {
			count: 0,
			mean: 0,
			min: 0,
			p50: 0,
			p95: 0,
			max: 0,
		};
	}

	const sorted = [...values].sort((a, b) => a - b);
	const sum = values.reduce((acc, value) => acc + value, 0);

	return {
		count: values.length,
		mean: sum / values.length,
		min: sorted[0] ?? 0,
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		max: sorted[sorted.length - 1] ?? 0,
	};
};

export const measureMs = async (
	fn: () => Promise<unknown>,
): Promise<number> => {
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

export const getStartOfDay = () => {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	return date;
};

export const getDaysAgo = (days: number) => {
	const date = new Date();
	date.setDate(date.getDate() - days);
	date.setHours(0, 0, 0, 0);
	return date;
};
export const getStartAndEndofDayAgo = (days: number) => {
	const date = new Date();
	date.setDate(date.getDate() - days);
	const startDate = new Date();
	startDate.setDate(date.getDate() - days);
	startDate.setHours(0, 0, 0, 0);
	const endDate = new Date();
	endDate.setDate(date.getDate() - days);
	endDate.setHours(23, 59, 59, 999);
	return { startDate, endDate };
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

type OrderStatus = (typeof orderStatus)[number];
type DeliveryProvider = (typeof deliveryProvider)[number];

interface OrderResult {
	id: number;
	orderNumber: string;
	customerPhone: number;
	status: OrderStatusType;
	total: number;
	notes: string | null;
	address: string;
	deliveryProvider: OrderDeliveryProviderType;
	createdAt: Date;
	updatedAt: Date | null;
	orderDetails: Array<{
		quantity: number;
		product: {
			name: string;
			price: number;
			id: number;
			images: Array<{
				url: string;
			}>;
		};
	}>;
	payments: Array<{
		status: PaymentStatusType;
		provider: PaymentProviderType;
		createdAt: Date;
	}>;
}

export interface ShapedOrder {
	id: number;
	orderNumber: string;
	customerPhone: number;
	status: OrderStatusType;
	total: number;
	notes: string | null;
	createdAt: Date;
	address: string;
	updatedAt: Date | null;
	deliveryProvider: OrderDeliveryProviderType;
	products: Array<{
		quantity: number;
		name: string;
		price: number;
		productId: number;
		imageUrl: string | undefined;
	}>;
	paymentStatus: PaymentStatusType;
	paymentProvider: PaymentProviderType;
}

export const shapeOrderResult = (result: OrderResult) => {
	result.payments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	const latestPayment = result.payments[0];
	return {
		id: result.id,
		orderNumber: result.orderNumber,
		customerPhone: `${result.customerPhone}`,
		status: result.status,
		total: result.total,
		notes: result.notes,
		createdAt: result.createdAt,
		address: result.address,
		updatedAt: result.updatedAt,
		products: result.orderDetails.map((orderDetail) => ({
			quantity: orderDetail.quantity,
			name: orderDetail.product.name,
			price: orderDetail.product.price,
			productId: orderDetail.product.id,
			imageUrl: orderDetail.product.images[0]?.url,
		})),
		deliveryProvider: result.deliveryProvider,
		paymentStatus: latestPayment?.status ?? "pending",
		paymentProvider: latestPayment?.provider ?? "transfer",
	};
};
export const shapeOrderResults = (results: OrderResult[]) => {
	return results?.map((result) => {
		result.payments.sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
		const latestPayment = result.payments[0];
		return {
			id: result.id,
			orderNumber: result.orderNumber,
			customerPhone: `${result.customerPhone}`,
			status: result.status,
			total: result.total,
			notes: result.notes,
			address: result.address,
			createdAt: result.createdAt,
			updatedAt: result.updatedAt,
			deliveryProvider: result.deliveryProvider,
			products: result.orderDetails.map((orderDetail) => ({
				quantity: orderDetail.quantity,
				name: orderDetail.product.name,
				productId: orderDetail.product.id,
				price: orderDetail.product.price,
				imageUrl: orderDetail.product.images[0]?.url,
			})),
			paymentStatus: latestPayment?.status ?? "pending",
			paymentProvider: latestPayment?.provider ?? "transfer",
		};
	});
};
