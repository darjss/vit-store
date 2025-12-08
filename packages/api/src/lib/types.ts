import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Context } from "hono";
import type {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "./constants";

export type HonoContextType = Context<
	{
		Bindings: Env;
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
