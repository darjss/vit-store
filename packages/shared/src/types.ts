export * from "./types/ai";
export * from "./types/order";
export * from "./types/payment";
export * from "./types/product";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { CustomerSelectType, UserSelectType } from "../../api/src/db/schema";

export interface AIExtractedData {
	amount: string;
	brand?: string | null;
	brandId?: number | null;
	categoryId?: number | null;
	dailyIntake: number;
	description: string;
	images: Array<{ url: string }>;
	ingredients?: Array<string>;
	name: string;
	name_mn?: string;
	potency: string;
	price?: number;
	seoDescription?: string;
	seoTitle?: string;
	tags?: Array<string>;
	weightGrams?: number;
}

export interface AIPurchaseProductDraft {
	amount: string;
	brand?: string | null;
	brandId?: number | null;
	categoryId?: number | null;
	description?: string | null;
	images?: Array<{ url: string }>;
	name: string;
	name_mn?: string | null;
	potency: string;
	rawText?: string | null;
	sourceCode?: string | null;
}

export interface AIPurchaseMatchedProduct {
	id: number;
	imageUrl?: string | null;
	name: string;
	price: number;
}

export interface AIPurchaseExtractedItem {
	candidateMatches?: Array<AIPurchaseMatchedProduct>;
	description: string;
	expirationDate?: string | null;
	lineTotal?: number | null;
	matchedProduct?: AIPurchaseMatchedProduct | null;
	matchStatus: "matched" | "ambiguous" | "unmatched";
	newProductDraft?: AIPurchaseProductDraft | null;
	productId?: number | null;
	quantity: number;
	sourceCode?: string | null;
	unitPrice: number;
	warnings: Array<string>;
}

export interface AIPurchaseExtractedData {
	errors: Array<string>;
	extractionStatus: "success" | "partial" | "failed";
	header: {
		externalOrderNumber?: string | null;
		notes?: string | null;
		orderedAt?: Date | null;
		provider: "amazon" | "iherb" | "naturebell" | "unknown";
		shippingCost?: number | null;
		subtotal?: number | null;
		total?: number | null;
		trackingNumber?: string | null;
	};
	items: Array<AIPurchaseExtractedItem>;
	rawText?: string | null;
}

export interface ProductFormValues {
	amount: string;
	brandId: string;
	categoryId: string;
	dailyIntake: number;
	description: string;
	expirationDate?: string;
	images: Array<{ id?: number; url: string }>;
	ingredients?: Array<string>;
	name: string;
	name_mn?: string;
	potency: string;
	price: number;
	seoDescription?: string;
	seoTitle?: string;
	status: "active" | "draft" | "out_of_stock";
	stock: number;
	tags?: Array<string>;
	weightGrams?: number;
}

export interface ProductCardData {
	amount?: string | null;
	brand?: { name: string } | null;
	/** Category id used for the stable sorbet wash mapping on the card. */
	categoryId?: number;
	/** Discount percent (0-100). 0 or absent means no sale price. */
	discount?: number;
	id: number;
	images: Array<{ url: string | null }>;
	name: string;
	name_mn?: string | null;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	/**
	 * Units on hand. Optional because some feeders (e.g. legacy home
	 * projections) do not select it; when absent the card renders without
	 * stock messaging and never disables add-to-cart.
	 */
	stock?: number;
}

export interface SessionConfig {
	cookieName: string;
	domainEnvVar: string;
	kvSessionPrefix: string;
	kvUserSessionPrefix: string;
	renewalThresholdMs: number;
	sessionDurationMs: number;
}

export interface AddSalesType {
	createdAt?: Date;
	orderId: number;
	productCost: number;
	productId: number;
	quantitySold: number;
	sellingPrice: number;
}

export type TransactionType = Parameters<
	Parameters<PostgresJsDatabase<Record<string, never>>["transaction"]>[0]
>[0];

export interface Session<TUser = CustomerSelectType | UserSelectType> {
	expiresAt: Date;
	id: string;
	user: TUser;
}
export type { CustomerSelectType, UserSelectType };
export interface PaymentWebhookResponse {
	body: {
		[key: string]: unknown;
		amount: number;
		completedAt: string;
		currency: string;
		initType: string;
		invoiceId: string;
		linkId: number;
		linkRef: string;
		paymentVendor: string;
		respCode: string;
		status: string;
		terminalId: string;
		transactionId: string | null;
	};
	message: string;
	status: string;
	type: string;
}

export interface RestockSubscription {
	channel: "sms" | "email";
	contact: string;
	createdAt: string;
	productId: number;
}

export interface OAuthCookieData {
	codeVerifier?: string;
	state?: string;
}

export interface GoogleIdTokenClaims {
	aud?: string | Array<string>;
	email?: string;
	email_verified?: boolean;
	exp?: number;
	iss?: string;
	name?: string;
	sub: string;
}

export type ImageUrlArray = Array<{ url: string }>;
