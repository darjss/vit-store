import { smsGateway } from "~/lib/integrations";
import { logger } from "~/lib/logger";

const MN_PHONE_RE = /^[6-9]\d{7}$/;
const SMS_SUCCESS_STATES = new Set(["Sent", "Delivered"]);

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

export const isMongolianMobile = (phone: number) => MN_PHONE_RE.test(String(phone));

export function getStorefrontBaseUrl(): string {
	const value = process.env.STORE_PUBLIC_URL;
	if (!value) {
		throw new Error("STORE_PUBLIC_URL is required");
	}
	const url = new URL(value);
	if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
		throw new Error("STORE_PUBLIC_URL must be a canonical https origin");
	}
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

// Owner-approved wording. Without the scheme the text is 195 UCS-2
// characters, 3 SMS parts. Do not reword.
export function buildUnpaidReminderSmsMessage(payLinkCode: string): string {
	const link = `${new URL(getStorefrontBaseUrl()).host}/pay/${payLinkCode}`;
	return `Сайн уу, Америк хүнс бараагаас холбогдож байна. Таны захиалгад зөвхөн төлбөр л үлдлээ. Апп нээгдээгүй бол энэ линкээр дахин оролдоорой: ${link} Асуух зүйл байвал 9999-3950`;
}

export async function sendPaymentSms(input: {
	customerPhone: number;
	event: string;
	message: string;
	orderNumber: string;
	paymentNumber: string;
}): Promise<void> {
	if (!isMongolianMobile(input.customerPhone)) {
		throw new SmsRetryableError("invalid_phone");
	}

	let finalState: { state: string };
	try {
		finalState = await smsGateway.sendSmsAndWait({
			message: input.message,
			phoneNumbers: [`+976${input.customerPhone}`],
		});
	} catch {
		// The gateway may have accepted the request before its response was lost.
		throw new SmsAmbiguousError();
	}

	if (finalState.state === "Failed") {
		throw new SmsRetryableError("provider_failed");
	}
	if (!SMS_SUCCESS_STATES.has(finalState.state)) {
		throw new SmsAmbiguousError();
	}

	logger.info(input.event, {
		orderNumber: input.orderNumber,
		paymentNumber: input.paymentNumber,
		smsState: finalState.state,
	});
}
