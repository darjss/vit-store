import { isServer } from "@/lib/runtime";

export interface MetaPixelParams {
	content_ids?: Array<string>;
	content_type?: "product";
	contents?: Array<{ id: string; quantity: number }>;
	currency: "MNT";
	num_items?: number;
	value: number;
}

// eventID lets a later Conversions API event dedupe against this browser event.
export interface MetaPixelOptions {
	eventID: string;
}

type MetaPixelEvent = "AddToCart" | "InitiateCheckout" | "Purchase" | "ViewContent";

// window.fbq only exists when meta-pixel.astro rendered the base code.
export function trackPixel(
	event: MetaPixelEvent,
	params: MetaPixelParams,
	options?: MetaPixelOptions,
) {
	if (!isServer) {
		window.fbq?.("track", event, params, options);
	}
}
