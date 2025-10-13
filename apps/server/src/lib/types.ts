import type { DrizzleD1Database } from "drizzle-orm/d1";
import type { CustomerSelectType, UserSelectType } from "@/db/schema";
import type {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "./constants";
import type { Context } from "hono";

export type HonoContextType=Context<{
    Bindings: CloudflareBindings;
}, any, any>

export interface SessionConfig {
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	cookieName: string;
	domainEnvVar: string;
	sessionDurationMs: number;
	renewalThresholdMs: number;
}

export type OrderStatusType = (typeof orderStatus)[number];
export type PaymentProviderType = (typeof paymentProvider)[number];
export type PaymentStatusType = (typeof paymentStatus)[number];
export type OrderDeliveryProviderType = (typeof deliveryProvider)[number];
export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}

export type TransactionType = Parameters<
	Parameters<DrizzleD1Database<typeof import("@/db/schema")>["transaction"]>[0]
>[0];

export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}
