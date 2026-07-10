import { smsGateway } from "~/lib/integrations";
import { logger } from "~/lib/logger";

const MN_PHONE_RE = /^[6-9]\d{7}$/;
const SMS_SUCCESS_STATES = new Set(["Sent", "Delivered"]);

export type OrderConfirmationSmsInput = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
};

export class SmsRetryableError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export class SmsAmbiguousError extends Error {
	constructor() {
		super("provider_ambiguous");
	}
}

function getStorefrontBaseUrl(): string {
	const value = process.env.STORE_PUBLIC_URL;
	if (!value) throw new Error("STORE_PUBLIC_URL is required");
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	)
		throw new Error("STORE_PUBLIC_URL must be a canonical https origin");
	return url.origin;
}

export function buildOrderConfirmationSmsMessage(input: {
	orderNumber: string;
	total: number;
}): string {
	const amount = `${input.total.toLocaleString("en-US")}₮`;
	const trackUrl = `${getStorefrontBaseUrl()}/order-tracking`;
	return `Захиалга #${input.orderNumber} баталгаажлаа. Нийт: ${amount}. Хянах: ${trackUrl}`;
}

export async function sendOrderConfirmationSms(
	input: OrderConfirmationSmsInput,
): Promise<void> {
	const phone = String(input.customerPhone);
	if (!MN_PHONE_RE.test(phone)) {
		throw new SmsRetryableError("invalid_phone");
	}

	const message = buildOrderConfirmationSmsMessage({
		orderNumber: input.orderNumber,
		total: input.total,
	});

	let finalState: { state: string };
	try {
		finalState = await smsGateway.sendSmsAndWait({
			message,
			phoneNumbers: [`+976${phone}`],
		});
	} catch {
		// The gateway may have accepted the request before its response was lost.
		throw new SmsAmbiguousError();
	}

	if (!SMS_SUCCESS_STATES.has(finalState.state)) {
		throw new SmsRetryableError("provider_not_accepted");
	}

	logger.info("order.sms_confirmation_sent", {
		paymentNumber: input.paymentNumber,
		orderNumber: input.orderNumber,
		smsState: finalState.state,
	});
}
