interface CartItemProperties {
	product_id: number;
	product_name: string;
	price: number;
	quantity: number;
}

type SearchAttribution = {
	searchId: string;
	query: string;
	productId: number;
	position: number;
	clickedAt: number;
};

const SEARCH_ATTRIBUTION_KEY = "vit-search-attribution";
const SEARCH_ATTRIBUTION_MAX_AGE_MS = 30 * 60 * 1000;
const trackedSearchClicks = new Set<string>();

const rememberSearchAttribution = (attribution: SearchAttribution) => {
	if (typeof window === "undefined") return;
	try {
		sessionStorage.setItem(SEARCH_ATTRIBUTION_KEY, JSON.stringify(attribution));
	} catch {}
};

const currentSearchAttribution = (productId: number) => {
	if (typeof window === "undefined") return null;
	try {
		const value: unknown = JSON.parse(
			sessionStorage.getItem(SEARCH_ATTRIBUTION_KEY) ?? "null",
		);
		if (
			typeof value !== "object" ||
			value === null ||
			!("searchId" in value) ||
			!("query" in value) ||
			!("productId" in value) ||
			!("position" in value) ||
			!("clickedAt" in value) ||
			typeof value.searchId !== "string" ||
			typeof value.query !== "string" ||
			typeof value.productId !== "number" ||
			value.productId !== productId ||
			typeof value.position !== "number" ||
			typeof value.clickedAt !== "number" ||
			Date.now() - value.clickedAt > SEARCH_ATTRIBUTION_MAX_AGE_MS
		) {
			return null;
		}
		return {
			searchId: value.searchId,
			query: value.query,
			productId: value.productId,
			position: value.position,
			clickedAt: value.clickedAt,
		};
	} catch {
		return null;
	}
};

const currentPageSource = () => {
	if (typeof window === "undefined") return "unknown";
	if (window.location.pathname === "/") return "home";
	if (/^\/products\/[^/]+/.test(window.location.pathname)) return "product";
	return "catalog";
};

function capture(event: string, properties?: Record<string, unknown>) {
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.capture(event, properties);
	}
}

function identify(distinctId: string, properties?: Record<string, unknown>) {
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.identify(distinctId, properties);
	}
}

export function captureException(
	error: unknown,
	properties?: Record<string, unknown>,
) {
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.captureException(error, properties);
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
		product_id: item.product_id,
		product_name: item.product_name,
		price: item.price,
		quantity: item.quantity,
		source: attribution ? "search" : currentPageSource(),
		page_path:
			typeof window === "undefined" ? undefined : window.location.pathname,
		search_id: attribution?.searchId,
		search_query: attribution?.query,
		search_position: attribution?.position,
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
 * Track when checkout page is loaded
 */
export function trackCheckoutStarted(
	cartTotal: number,
	itemCount: number,
	productIds: number[],
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
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.capture("qpay_error", {
			payment_number: paymentNumber,
			error_message: errorMessage,
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
	productIds: number[],
) {
	capture("search_performed", {
		search_id: searchId,
		query,
		results_count: resultsCount,
		result_product_ids: productIds,
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
		searchId,
		query,
		productId,
		position,
		clickedAt: Date.now(),
	});
	const clickKey = `${searchId}:${productId}`;
	if (trackedSearchClicks.has(clickKey)) return;
	trackedSearchClicks.add(clickKey);
	capture("search_result_clicked", {
		search_id: searchId,
		query,
		product_id: productId,
		product_name: productName,
		position,
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
	productIds: number[],
) {
	capture("assistant_products_shown", {
		display_type: displayType,
		product_ids: productIds,
		product_count: productIds.length,
	});
}

export function trackAssistantAddToCart(
	productId: number,
	productName: string,
) {
	capture("assistant_add_to_cart", {
		product_id: productId,
		product_name: productName,
	});
}

export function trackAssistantCheckoutClicked(productIds: number[]) {
	capture("assistant_checkout_clicked", {
		product_ids: productIds,
		product_count: productIds.length,
	});
}

type RestockChannel = "sms" | "email";
type RestockCustomerType = "guest" | "verified_customer";

type RestockEvent = {
	productId: number;
	channel?: RestockChannel;
	customerType: RestockCustomerType;
};

function restockProperties(event: RestockEvent) {
	return {
		product_id: event.productId,
		...(event.channel ? { channel: event.channel } : {}),
		customer_type: event.customerType,
	};
}

export function trackRestockSheetOpened(event: RestockEvent) {
	capture("restock_sheet_opened", restockProperties(event));
}

export function trackRestockChannelSelected(
	event: RestockEvent & { channel: RestockChannel },
) {
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
		channel: RestockChannel;
		alreadySubscribed: boolean;
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
