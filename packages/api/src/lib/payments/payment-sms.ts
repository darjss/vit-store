import {
	isAmbiguousWeSendError,
	isRetryableWeSendError,
	sendSms,
	WeSendError,
} from "~/lib/integrations";
import { logger } from "~/lib/logger";

const MN_PHONE_RE = /^[6-9]\d{7}$/;

export class SmsRetryableError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

export class SmsPermanentError extends Error {
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

// Pure Latin ASCII (~134 chars prod, 142 staging) — 1 WeSend SMS part (80 MNT).
export function buildOrderConfirmationSmsMessage(input: {
	orderNumber: string;
	total: number;
}): string {
	const amount = `${input.total.toLocaleString("en-US")}T`;
	const trackUrl = `${getStorefrontBaseUrl()}/order-tracking`;
	return `Amerik Vitamin: #${input.orderNumber} (${amount}) tolbor batalgaajlaa, bayarlalaa! Hurgeltiin yavts hyanah: ${trackUrl}`;
}

// Pure Latin ASCII (~139 chars prod, 147 staging) — 1 WeSend SMS part (80 MNT).
export function buildUnpaidReminderSmsMessage(input: {
	orderNumber: string;
	payLinkCode: string;
	total: number;
}): string {
	const amount = `${input.total.toLocaleString("en-US")}T`;
	return `Amerik Vitamin: #${input.orderNumber} (${amount}) zahialgiig tanii ner deer hadgalsan baina. QPay/dansaar toloh: ${getStorefrontBaseUrl()}/pay/${input.payLinkCode}`;
}

export async function sendPaymentSms(input: {
	customerPhone: number;
	event: string;
	message: string;
	orderNumber: string;
	paymentNumber: string;
}): Promise<void> {
	if (!isMongolianMobile(input.customerPhone)) {
		throw new SmsPermanentError("invalid_phone");
	}

	try {
		const sent = await sendSms({
			text: input.message,
			to: String(input.customerPhone),
		});
		logger.info(input.event, {
			balance: sent.balance,
			credits: sent.credits,
			encoding: sent.encoding,
			orderNumber: input.orderNumber,
			parts: sent.parts,
			paymentNumber: input.paymentNumber,
			smsId: sent.id,
		});
	} catch (error) {
		if (error instanceof WeSendError) {
			logger.error("sms.send_failed", error.message, {
				code: error.code,
				event: input.event,
				paymentNumber: input.paymentNumber,
				requestId: error.requestId,
				status: error.status,
			});
			if (isRetryableWeSendError(error)) {
				throw new SmsRetryableError(error.code);
			}
			if (isAmbiguousWeSendError(error)) {
				throw new SmsAmbiguousError();
			}
			throw new SmsPermanentError(error.code);
		}
		logger.error("sms.send_failed", error instanceof Error ? error.message : String(error), {
			event: input.event,
			paymentNumber: input.paymentNumber,
		});
		throw new SmsAmbiguousError();
	}
}
