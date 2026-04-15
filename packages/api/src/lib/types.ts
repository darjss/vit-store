import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Context } from "hono";
import type {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "./constants";

export type HonoContextType = Context<{
	Bindings: Env;
}>;

export interface SessionConfig {
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	cookieName: string;
	sessionDurationMs: number;
	renewalThresholdMs: number;
}

export type OrderStatusType = (typeof orderStatus)[number];
export type PaymentProviderType = (typeof paymentProvider)[number];
export type PaymentStatusType = (typeof paymentStatus)[number];
export type OrderDeliveryProviderType = (typeof deliveryProvider)[number];
export type StoreAssistantDisplayType =
	| "none"
	| "single-product"
	| "product-carousel";

export interface StoreAssistantMessageInput {
	role: "user" | "assistant";
	content: string;
}

export interface StoreAssistantPageContext {
	path?: string;
	productId?: number;
	searchQuery?: string;
}

export interface StoreAssistantResponse {
	answer: string;
	displayType: StoreAssistantDisplayType;
	productIds: number[];
}

export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}

export type TransactionType = Parameters<
	Parameters<
		PostgresJsDatabase<typeof import("../db/schema")>["transaction"]
	>[0]
>[0];

export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}
