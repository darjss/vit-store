import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { RequestLogger } from "evlog";
import type { Context } from "hono";
import type {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
} from "~/lib/constants";

export type HonoContextType = Context<{
	Bindings: Env;
	Variables: { log: RequestLogger<any> };
}>;

export interface SessionConfig {
	cookieName: string;
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	renewalThresholdMs: number;
	sessionDurationMs: number;
}

export type OrderStatusType = (typeof orderStatus)[number];
export type PaymentProviderType = (typeof paymentProvider)[number];
export type PaymentStatusType = (typeof paymentStatus)[number];
export type OrderDeliveryProviderType = (typeof deliveryProvider)[number];
export interface AddSalesType {
	createdAt?: Date;
	orderId: number;
	productCost: number;
	productId: number;
	quantitySold: number;
	sellingPrice: number;
}

export type TransactionType = Parameters<
	Parameters<PostgresJsDatabase<typeof import("~/db/schema")>["transaction"]>[0]
>[0];
