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
export interface AddSalesType {
	productCost: number;
	quantitySold: number;
	orderId: number;
	sellingPrice: number;
	productId: number;
	createdAt?: Date;
}

// D1 has no interactive transactions; helpers that previously received a
// transaction handle now receive the D1 database directly.
export type TransactionType = import("~/db/index").DB;
