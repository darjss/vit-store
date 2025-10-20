import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { Context } from "hono";

export type HonoContextType = Context<
	{
		Bindings: CloudflareBindings;
	},
	any,
	any
>;

export interface SessionConfig {
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	cookieName: string;
	domainEnvVar: string;
	sessionDurationMs: number;
	renewalThresholdMs: number;
}

export type OrderStatusType = "pending" | "shipped" | "delivered" | "cancelled" | "refunded";
export type PaymentProviderType = "qpay" | "transfer" | "cash";
export type PaymentStatusType = "pending" | "success" | "failed";
export type OrderDeliveryProviderType = "tu-delivery" | "self" | "avidaa";

export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}

export type TransactionType = Parameters<
	Parameters<DrizzleD1Database<any>["transaction"]>[0]
>[0];

// Constants
export const status = ["active", "draft", "out_of_stock"] as const;
export const orderStatus = [
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
] as const;
export const paymentProvider = ["qpay", "transfer", "cash"] as const;
export const deliveryProvider = ["tu-delivery", "self", "avidaa"] as const;
export const paymentStatus = ["pending", "success", "failed"] as const;
export const PRODUCT_PER_PAGE = 5;
export const productFields = [
	"id",
	"name",
	"slug",
	"description",
	"status",
	"discount",
	"amount",
	"potency",
	"stock",
	"price",
	"dailyIntake",
	"categoryId",
	"brandId",
	"createdAt",
	"updatedAt",
] as const;