import type { CustomerSelectType } from "@/db/schema";
import type {
  deliveryProvider,
	paymentProvider,
	paymentStatus,
	orderStatus,
} from "./constants";
import type { DrizzleD1Database } from "drizzle-orm/d1";

export interface Session {
	id: string;
	user: CustomerSelectType;
	expiresAt: Date;
}
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

