import { parse, safeParse, type InferOutput } from "valibot";

import type { AnalyticsProperties } from "@/lib/analytics-props";
import { thrownErrorWireSchema, type ThrownErrorWire } from "@/lib/error-wire";
import { isServer } from "@/lib/runtime";
import { searchAttributionSchema } from "@/lib/search-attribution";

interface CartItemProperties {
	price: number;
	product_id: number;
	product_name: string;
	quantity: number;
}

const SEARCH_ATTRIBUTION_KEY = "vit-search-attribution";
const SEARCH_ATTRIBUTION_MAX_AGE_MS = 30 * 60 * 1000;
const trackedSearchClicks = new Set<string>();

const rememberSearchAttribution = (attribution: InferOutput<typeof searchAttributionSchema>) => {
	if (isServer) {
		return;
	}
	try {
		sessionStorage.setItem(SEARCH_ATTRIBUTION_KEY, JSON.stringify(attribution));
	} catch {
		// sessionStorage unavailable
	}
};

const currentSearchAttribution = (productId: number) => {
	if (isServer) {
		return null;
	}
	try {
		const parsed = safeParse(
			searchAttributionSchema,
			JSON.parse(sessionStorage.getItem(SEARCH_ATTRIBUTION_KEY) ?? "null"),
		);
		if (
			!parsed.success ||
			parsed.output.productId !== productId ||
			Date.now() - parsed.output.clickedAt > SEARCH_ATTRIBUTION_MAX_AGE_MS
		) {
			return null;
		}
		return parsed.output;
	} catch {
		return null;
	}
};

const currentPageSource = () => {
	if (isServer) {
		return "unknown";
	}
	if (window.location.pathname === "/") {
		return "home";
	}
	if (/^\/products\/[^/]+/.test(window.location.pathname)) {
		return "product";
	}
	return "catalog";
};

function capture(event: string, properties?: AnalyticsProperties) {
	if (!isServer && window.posthog) {
		window.posthog.capture(event, properties);
	}
}

function identify(distinctId: string, properties?: AnalyticsProperties) {
	if (!isServer && window.posthog) {
		window.posthog.identify(distinctId, properties);
	}
}

export function captureException(error: ThrownErrorWire, properties?: AnalyticsProperties) {
	if (!isServer && window.posthog) {
		window.posthog.captureException(parse(thrownErrorWireSchema, error), properties);
	}
}

/**
 * Hash a string using SHA-256 (for phone number anonymization)
 */
async function hashString(str: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Track when item is added to cart
 */
export function trackAddToCart(item: CartItemProperties) {
	const attribution = currentSearchAttribution(item.product_id);
	capture("add_to_cart", {
		page_path: isServer ? undefined : window.location.pathname,
		price: item.price,
		product_id: item.product_id,
		product_name: item.product_name,
		quantity: item.quantity,
		search_id: attribution?.searchId,
		search_position: attribution?.position,
		search_query: attribution?.query,
		source: attribution ? "search" : currentPageSource(),
	});
}

/**
 * Track when item is removed from cart
 */
export function trackRemoveFromCart(productId: number) {
	capture("remove_from_cart", {
		product_id: productId,
	});
}

/**
 * Track when cart drawer is opened
 */
export function trackCartOpened(cartCount: number, cartTotal: number) {
	capture("cart_opened", {
		cart_count: cartCount,
		cart_total: cartTotal,
	});
}

/**
 * Detects social-app in-app browsers from the user agent. Deep links to bank
 * apps frequently fail inside these webviews, so payment events carry this so
 * failures can be attributed to a specific host app.
 */
export function detectInAppBrowser(): string {
	if (isServer) {
		return "unknown";
	}
	const ua = navigator.userAgent;
	if (/FB_IAB|FBAN\/FBIOS/.test(ua)) {
		return "facebook";
	}
	if (/Instagram/i.test(ua)) {
		return "instagram";
	}
	if (/\bwv\b/.test(ua)) {
		return "android_webview";
	}
	return "none";
}

/**
 * Tracks the three moments of a bank deep link tap. Outcome detection lives
 * in `deeplink-handoff.ts`; these just record it.
 */
export function trackBankDeeplinkClicked(bank: string, paymentNumber: string) {
	capture("bank_deeplink_clicked", {
		bank,
		in_app_browser: detectInAppBrowser(),
		payment_number: paymentNumber,
	});
}

export function trackBankDeeplinkOpened(bank: string, paymentNumber: string, elapsedMs: number) {
	capture("bank_deeplink_app_opened", {
		bank,
		elapsed_ms: elapsedMs,
		in_app_browser: detectInAppBrowser(),
		payment_number: paymentNumber,
	});
}

export function trackBankDeeplinkNoHandoff(bank: string, paymentNumber: string) {
	capture("bank_deeplink_no_handoff", {
		bank,
		in_app_browser: detectInAppBrowser(),
		payment_number: paymentNumber,
	});
}

export function trackPaymentRecoverySheetShown(
	paymentNumber: string,
	reason: "no_handoff" | "returned_unpaid",
) {
	capture("payment_recovery_sheet_shown", {
		in_app_browser: detectInAppBrowser(),
		payment_number: paymentNumber,
		reason,
	});
}

export function trackPaymentRecoveryChosen(
	paymentNumber: string,
	choice: "qr" | "transfer" | "dismiss",
) {
	capture("payment_recovery_chosen", {
		choice,
		in_app_browser: detectInAppBrowser(),
		payment_number: paymentNumber,
	});
}

/**
 * Track when checkout page is loaded
 */
export function trackCheckoutStarted(
	cartTotal: number,
	itemCount: number,
	productIds: Array<number>,
) {
	capture("checkout_started", {
		cart_total: cartTotal,
		item_count: itemCount,
		product_ids: productIds,
	});
}

/**
 * Track QPay invoice creation errors
 */
export function trackQpayError(paymentNumber: string, errorMessage: string) {
	if (!isServer && window.posthog) {
		window.posthog.capture("qpay_error", {
			error_message: errorMessage,
			payment_number: paymentNumber,
		});
	}
}

// ============================================
// User Identification
// ============================================

/**
 * Identify user after successful login (uses hashed phone)
 */
export async function identifyUser(phone: string) {
	const hashedPhone = await hashString(phone);
	identify(hashedPhone, {
		phone_hash: hashedPhone,
	});
}

// ============================================
// Search Events
// ============================================

/**
 * Track when a settled search query resolves. Callers should fire this for the
 * query the user stopped typing on, not per keystroke. `zero_result` flags
 * queries that returned nothing so zero-result rate is queryable directly.
 */
export function trackSearchPerformed(
	query: string,
	resultsCount: number,
	searchId: string,
	productIds: Array<number>,
) {
	capture("search_performed", {
		query,
		result_product_ids: productIds,
		results_count: resultsCount,
		search_id: searchId,
		zero_result: resultsCount === 0,
	});
}

/**
 * Track when a search result is clicked
 */
export function trackSearchResultClicked(
	searchId: string,
	query: string,
	productId: number,
	productName: string,
	position: number,
) {
	rememberSearchAttribution({
		clickedAt: Date.now(),
		position,
		productId,
		query,
		searchId,
	});
	const clickKey = `${searchId}:${productId}`;
	if (trackedSearchClicks.has(clickKey)) {
		return;
	}
	trackedSearchClicks.add(clickKey);
	capture("search_result_clicked", {
		position,
		product_id: productId,
		product_name: productName,
		query,
		search_id: searchId,
	});
}

export function trackAssistantOpened() {
	capture("assistant_opened");
}

export function trackAssistantMessageSent(message: string) {
	capture("assistant_message_sent", {
		message_length: message.trim().length,
	});
}

export function trackAssistantStarterPromptClicked(prompt: string) {
	capture("assistant_starter_prompt_clicked", {
		prompt,
	});
}

export function trackAssistantProductsShown(
	displayType: "single-product" | "product-carousel",
	productIds: Array<number>,
) {
	capture("assistant_products_shown", {
		display_type: displayType,
		product_count: productIds.length,
		product_ids: productIds,
	});
}

export function trackAssistantAddToCart(productId: number, productName: string) {
	capture("assistant_add_to_cart", {
		product_id: productId,
		product_name: productName,
	});
}

export function trackAssistantCheckoutClicked(productIds: Array<number>) {
	capture("assistant_checkout_clicked", {
		product_count: productIds.length,
		product_ids: productIds,
	});
}

type RestockChannel = "sms" | "email";
type RestockCustomerType = "guest" | "verified_customer";

type RestockEvent = {
	channel?: RestockChannel;
	customerType: RestockCustomerType;
	productId: number;
};

function restockProperties(event: RestockEvent): AnalyticsProperties {
	const properties: AnalyticsProperties = {
		customer_type: event.customerType,
		product_id: event.productId,
	};
	if (event.channel) {
		properties.channel = event.channel;
	}
	return properties;
}

export function trackRestockSheetOpened(event: RestockEvent) {
	capture("restock_sheet_opened", restockProperties(event));
}

export function trackRestockChannelSelected(event: RestockEvent & { channel: RestockChannel }) {
	capture("restock_channel_selected", restockProperties(event));
}

export function trackRestockConfirmationRequested(
	event: RestockEvent & { channel: RestockChannel },
) {
	capture("restock_confirmation_requested", restockProperties(event));
}

export function trackRestockConfirmationCompleted(
	event: RestockEvent & { channel: RestockChannel },
) {
	capture("restock_confirmation_completed", restockProperties(event));
}

export function trackRestockSubscriptionCreated(
	event: RestockEvent & {
		alreadySubscribed: boolean;
		channel: RestockChannel;
	},
) {
	capture("restock_subscription_created", {
		...restockProperties(event),
		already_subscribed: event.alreadySubscribed,
	});
}

export function trackRestockSubscriptionFailed(
	event: RestockEvent & {
		channel: RestockChannel;
		errorCode: string;
	},
) {
	capture("restock_subscription_failed", {
		...restockProperties(event),
		error_code: event.errorCode,
	});
}
