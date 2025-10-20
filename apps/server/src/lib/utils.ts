import type { timeRangeType } from "@vit-store/shared/schema";
import { customAlphabet } from "nanoid";
import type {
	OrderDeliveryProviderType,
	OrderStatusType,
	PaymentProviderType,
	PaymentStatusType,
} from "./types";

export const generateOrderNumber = () => {
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
	if (result.payments[0] === undefined) {
		throw new Error("No payment info found");
	}
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
		paymentStatus: result.payments[0]?.status,
		paymentProvider: result.payments[0]?.provider,
	};
};
export const shapeOrderResults = (results: OrderResult[]) => {
	return results?.map((result) => {
		result.payments.sort(
			(a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
		);
		if (result.payments[0] === undefined) {
			console.log("No payment info found");
			throw new Error("No payment info found");
		}
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
			paymentStatus: result.payments[0]?.status,
			paymentProvider: result.payments[0]?.provider,
		};
	});
};
