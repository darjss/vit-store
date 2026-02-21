export * from "./types/ai";
export * from "./types/integration";
export * from "./types/messenger";
export * from "./types/order";
export * from "./types/payment";
export * from "./types/product";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type {
	CustomerSelectType,
	UserSelectType,
} from "../../api/src/db/schema";

export interface AIExtractedData {
	name: string;
	name_mn?: string;
	description: string;
	brand?: string | null;
	amount: string;
	potency: string;
	dailyIntake: number;
	weightGrams?: number;
	seoTitle?: string;
	seoDescription?: string;
	tags?: string[];
	ingredients?: string[];
	images: { url: string }[];
}

export interface ProductFormValues {
	name: string;
	description: string;
	dailyIntake: number;
	brandId: string;
	categoryId: string;
	amount: string;
	potency: string;
	status: "active" | "draft" | "out_of_stock";
	stock: number;
	price: number;
	images: { url: string; id?: number }[];
	name_mn?: string;
	ingredients?: string[];
	tags?: string[];
	seoTitle?: string;
	seoDescription?: string;
	weightGrams?: number;
}

export interface ProductCardData {
	id: number;
	name: string;
	price: number;
	slug: string;
	images: { url: string | null }[];
	brand?: { name: string } | null;
}

export interface SessionConfig {
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	cookieName: string;
	domainEnvVar: string;
	sessionDurationMs: number;
	renewalThresholdMs: number;
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
	Parameters<PostgresJsDatabase<any>["transaction"]>[0]
>[0];

export interface Session<TUser = CustomerSelectType | UserSelectType> {
	id: string;
	user: TUser;
	expiresAt: Date;
}
export type { CustomerSelectType, UserSelectType };
export interface PaymentWebhookResponse {
	type: string;
	status: string;
	message: string;
	body: {
		amount: number;
		currency: string;
		completedAt: string;
		terminalId: string;
		invoiceId: string;
		paymentVendor: string;
		initType: string;
		status: string;
		respCode: string;
		transactionId: string | null;
		linkId: number;
		linkRef: string;
		[key: string]: any;
	};
}

export interface RestockSubscription {
	productId: number;
	channel: "sms" | "email";
	contact: string;
	createdAt: string;
}

export interface OAuthCookieData {
	state?: string;
	codeVerifier?: string;
}

export interface GoogleIdTokenClaims {
	sub: string;
	name?: string;
	email?: string;
	email_verified?: boolean;
	iss?: string;
	aud?: string | string[];
	exp?: number;
}

export type ImageUrlArray = { url: string }[];
