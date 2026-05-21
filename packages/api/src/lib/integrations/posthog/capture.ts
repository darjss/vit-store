import { PostHog } from "posthog-node";
import { env } from "cloudflare:workers";

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

interface TrackOrderPlacedProps {
	phone: string;
	orderNumber: string;
	paymentNumber?: string;
	itemCount: number;
	total: number;
	currency?: string;
	referrer?: string;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
}

export async function trackOrderPlacedServerSide(props: TrackOrderPlacedProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "order_placed",
			properties: {
				order_number: props.orderNumber,
				payment_number: props.paymentNumber,
				item_count: props.itemCount,
				$revenue: props.total,
				currency: props.currency ?? "MNT",
				$referrer: props.referrer,
				utm_source: props.utmSource,
				utm_medium: props.utmMedium,
				utm_campaign: props.utmCampaign,
			},
		});
	} catch {
		// Silently fail — analytics should never break the order flow
	}
}

interface TrackPaymentConfirmedProps {
	phone: string;
	paymentNumber: string;
	orderNumber?: string;
	provider: "qpay" | "transfer";
	revenue: number;
	currency?: string;
	referrer?: string;
}

export async function trackPaymentConfirmedServerSide(
	props: TrackPaymentConfirmedProps,
) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "payment_confirmed",
			properties: {
				payment_number: props.paymentNumber,
				order_number: props.orderNumber,
				provider: props.provider,
				$revenue: props.revenue,
				currency: props.currency ?? "MNT",
				$referrer: props.referrer,
			},
		});
	} catch {
		// Silently fail — analytics should never break the payment flow
	}
}

interface TrackQpayInvoiceFailedProps {
	phone: string;
	paymentNumber: string;
	errorMessage: string;
	referrer?: string;
}

export async function trackQpayInvoiceFailedServerSide(
	props: TrackQpayInvoiceFailedProps,
) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.captureImmediate({
			distinctId,
			event: "qpay_invoice_failed",
			properties: {
				payment_number: props.paymentNumber,
				error_message: props.errorMessage,
				$referrer: props.referrer,
			},
		});
	} catch {
		// Silently fail
	}
}

interface IdentifyUserProps {
	phone: string;
	referrer?: string;
	utmSource?: string;
	utmMedium?: string;
	utmCampaign?: string;
}

export async function identifyUserServerSide(props: IdentifyUserProps) {
	try {
		const distinctId = await hashPhone(props.phone);
		const posthog = getClient();
		await posthog.identify({
			distinctId,
			properties: {
				$set: {
					phone_hash: distinctId,
					$initial_referrer: props.referrer,
					$initial_utm_source: props.utmSource,
					$initial_utm_medium: props.utmMedium,
					$initial_utm_campaign: props.utmCampaign,
				},
			},
		});
	} catch {
		// Silently fail
	}
}
