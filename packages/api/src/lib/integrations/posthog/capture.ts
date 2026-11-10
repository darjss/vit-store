import { env, waitUntil } from "cloudflare:workers";
import { type EventMessage, PostHog } from "posthog-node";
import type { ConfirmPaymentSource } from "~/lib/payments/transfer-confirmation";

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

/**
 * The distinct id is the SHA-256 of the phone, the same id the storefront
 * passes to `posthog.identify`, so server events land on the browser person.
 * A Worker cancels fetches still running when its response is sent, so the
 * send is handed to `waitUntil`. Analytics never throws into the caller.
 */
function capture(phone: string, event: string, properties: EventMessage["properties"]) {
	const send = async () => {
		await getClient().captureImmediate({
			distinctId: await hashPhone(phone),
			event,
			properties,
		});
	};
	waitUntil(send().catch(() => {}));
}

/** Where an Order was entered: storefront checkout, the Messenger bot, or the admin (dashboard or Telegram bot). */
export type OrderSource = "web" | "messenger" | "admin";

type OrderLine = { price: number; productId: number; quantity: number };

/** `content_ids` matches the Meta Pixel's string product ids. */
function lineProperties(lines: Array<OrderLine>) {
	return {
		content_ids: lines.map((line) => String(line.productId)),
		currency: "MNT",
		num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
		product_ids: lines.map((line) => line.productId),
		products: lines.map((line) => ({
			price: line.price,
			product_id: line.productId,
			quantity: line.quantity,
		})),
	};
}

type TrackOrderCreatedProps = {
	lines: Array<OrderLine>;
	orderNumber: string;
	paymentNumber: string;
	phone: string;
	source: OrderSource;
	total: number;
};

/** Order intent. Carries `order_value`, never `$revenue`: only a confirmed payment is revenue. */
export function trackOrderCreatedServerSide(props: TrackOrderCreatedProps) {
	capture(props.phone, "order_created", {
		...lineProperties(props.lines),
		order_number: props.orderNumber,
		order_value: props.total,
		payment_number: props.paymentNumber,
		source: props.source,
	});
}

/** The shape `paymentQueries.store.getPaymentInfoByNumber` returns. */
type ConfirmedPayment = {
	order: {
		customerPhone: number;
		orderDetails: Array<{
			price: number | null;
			product: { id: number; price: number };
			quantity: number;
		}>;
		orderNumber: string;
		total: number;
	};
	paymentNumber: string;
	provider: string;
};

/** One event per successful Payment, from every confirm path. The only event with `$revenue`. */
export function trackPaymentConfirmedServerSide(
	payment: ConfirmedPayment,
	confirmationSource: ConfirmPaymentSource,
) {
	capture(String(payment.order.customerPhone), "payment_confirmed", {
		...lineProperties(
			payment.order.orderDetails.map((detail) => ({
				price: detail.price ?? detail.product.price,
				productId: detail.product.id,
				quantity: detail.quantity,
			})),
		),
		$revenue: payment.order.total,
		confirmation_source: confirmationSource,
		order_number: payment.order.orderNumber,
		payment_number: payment.paymentNumber,
		provider: payment.provider,
	});
}

type TrackQpayInvoiceFailedProps = {
	errorMessage: string;
	paymentNumber: string;
	phone: string;
};

export function trackQpayInvoiceFailedServerSide(props: TrackQpayInvoiceFailedProps) {
	capture(props.phone, "qpay_invoice_failed", {
		error_message: props.errorMessage,
		payment_number: props.paymentNumber,
	});
}

type TrackQpayInvoiceCreatedProps = {
	paymentNumber: string;
	phone: string;
};

export function trackQpayInvoiceCreatedServerSide(props: TrackQpayInvoiceCreatedProps) {
	capture(props.phone, "qpay_invoice_created", {
		payment_number: props.paymentNumber,
	});
}
