/**
 * PostHog Analytics Utility
 * Centralized, SSR-safe tracking functions for e-commerce events
 */

// Types for cart items
interface CartItemProperties {
	product_id: number;
	product_name: string;
	price: number;
	quantity: number;
}

interface ProductViewedProperties {
	product_id: number;
	product_name: string;
	product_price: number;
	product_slug: string;
}

// SSR-safe capture wrapper
function capture(event: string, properties?: Record<string, unknown>) {
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.capture(event, properties);
	}
}

// SSR-safe identify wrapper
function identify(distinctId: string, properties?: Record<string, unknown>) {
	if (typeof window !== "undefined" && window.posthog) {
		window.posthog.identify(distinctId, properties);
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

// ============================================
// E-commerce Core Events
// ============================================

/**
 * Track when a product page is viewed
 */
export function trackProductViewed(properties: ProductViewedProperties) {
	capture("product_viewed", { ...properties });
}

/**
 * Track when item is added to cart
 */
export function trackAddToCart(item: CartItemProperties) {
	capture("add_to_cart", {
		product_id: item.product_id,
		product_name: item.product_name,
		price: item.price,
		quantity: item.quantity,
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
 * Track when order is successfully placed
 */
export function trackOrderPlaced(orderNumber: string, itemCount: number) {
	capture("order_placed", {
		order_number: orderNumber,
		item_count: itemCount,
	});
}

/**
 * Track when payment is confirmed
 */
export function trackPaymentConfirmed(
	paymentNumber: string,
	orderNumber: string,
) {
	capture("payment_confirmed", {
		payment_number: paymentNumber,
		order_number: orderNumber,
	});
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
 * Track when a search is performed
 */
export function trackSearchPerformed(query: string, resultsCount: number) {
	capture("search_performed", {
		query,
		results_count: resultsCount,
	});
}

/**
 * Track when a search result is clicked
 */
export function trackSearchResultClicked(
	query: string,
	productId: number,
	productName: string,
	position: number,
) {
	capture("search_result_clicked", {
		query,
		product_id: productId,
		product_name: productName,
		position,
	});
}
