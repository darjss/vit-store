import { env } from "cloudflare:workers";
import { PostHog } from "posthog-node";

let client: PostHog | null = null;

function getClient(): PostHog {
	if (!client) {
		client = new PostHog(env.POSTHOG_PROJECT_API_KEY, {
			host: env.POSTHOG_HOST ?? "https://us.i.posthog.com",
		});
	}
	return client;
}

async function hashPhone(phone: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(phone);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface TrackOrderCreatedProps {
	currency?: string;
	itemCount: number;
	orderNumber: string;
	paymentNumber?: string;
	phone: string;
	referrer?: string;
	total: number;
	utmCampaign?: string;
	utmMedium?: string;
	utmSource?: string;
}

export async function trackOrderCreatedServerSide(props: TrackOrderCreatedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "order_created",
			properties: {
				$referrer: props.referrer,
				$revenue: props.total,
				currency: props.currency ?? "MNT",
				item_count: props.itemCount,
				order_number: props.orderNumber,
				payment_number: props.paymentNumber,
				utm_campaign: props.utmCampaign,
				utm_medium: props.utmMedium,
				utm_source: props.utmSource,
			},
		});
	} catch {
		// Silently fail — analytics should never break the order flow
	}
}

interface TrackOrderPlacedProps {
	currency?: string;
	orderNumber: string;
	paymentNumber: string;
	phone: string;
	provider: "qpay" | "transfer";
	total: number;
}

export async function trackOrderPlacedServerSide(props: TrackOrderPlacedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "order_placed",
			properties: {
				$revenue: props.total,
				currency: props.currency ?? "MNT",
				order_number: props.orderNumber,
				payment_number: props.paymentNumber,
				provider: props.provider,
			},
		});
	} catch {
		// Silently fail — analytics should never break the flow
	}
}

interface TrackPaymentConfirmedProps {
	currency?: string;
	orderNumber?: string;
	paymentNumber: string;
	phone: string;
	products: Array<{ productId: number; quantity: number }>;
	provider: "qpay" | "transfer";
	referrer?: string;
	revenue: number;
}

export async function trackPaymentConfirmedServerSide(props: TrackPaymentConfirmedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "payment_confirmed",
			properties: {
				$referrer: props.referrer,
				$revenue: props.revenue,
				currency: props.currency ?? "MNT",
				order_number: props.orderNumber,
				payment_number: props.paymentNumber,
				product_ids: props.products.map(({ productId }) => productId),
				products: props.products,
				provider: props.provider,
			},
		});
	} catch {
		// Silently fail — analytics should never break the payment flow
	}
}

interface TrackQpayInvoiceFailedProps {
	errorMessage: string;
	paymentNumber: string;
	phone: string;
	referrer?: string;
}

export async function trackQpayInvoiceFailedServerSide(props: TrackQpayInvoiceFailedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "qpay_invoice_failed",
			properties: {
				$referrer: props.referrer,
				error_message: props.errorMessage,
				payment_number: props.paymentNumber,
			},
		});
	} catch {
		// Silently fail
	}
}

interface TrackQpayInvoiceCreatedProps {
	paymentNumber: string;
	phone: string;
}

export async function trackQpayInvoiceCreatedServerSide(props: TrackQpayInvoiceCreatedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "qpay_invoice_created",
			properties: {
				payment_number: props.paymentNumber,
			},
		});
	} catch {
		// Silently fail
	}
}

interface IdentifyUserProps {
	phone: string;
	referrer?: string;
	utmCampaign?: string;
	utmMedium?: string;
	utmSource?: string;
}

export async function identifyUserServerSide(props: IdentifyUserProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.identify({
			distinctId,
			properties: {
				$set: {
					$initial_referrer: props.referrer,
					$initial_utm_campaign: props.utmCampaign,
					$initial_utm_medium: props.utmMedium,
					$initial_utm_source: props.utmSource,
					phone_hash: distinctId,
				},
			},
		});
	} catch {
		// Silently fail
	}
}
