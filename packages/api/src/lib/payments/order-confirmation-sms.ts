import {
	ambiguousDelivery,
	type DeliveryFailure,
	invalidDelivery,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import { smsGateway } from "~/lib/integrations/sms/client";
import { logger } from "~/lib/logger";

const MN_PHONE_RE = /^[6-9]\d{7}$/;

const smsStateSchema = v.object({
	state: v.picklist(["Pending", "Processed", "Sent", "Delivered", "Failed"]),
});

type SmsState = v.InferOutput<typeof smsStateSchema>["state"];

const smsStateTags = {
	Pending: { _tag: "Pending" },
	Processed: { _tag: "Processed" },
	Sent: { _tag: "Sent" },
	Delivered: { _tag: "Delivered" },
	Failed: { _tag: "Failed" },
} as const satisfies Record<SmsState, { _tag: SmsState }>;

export type OrderConfirmationSmsInput = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
};

/** @deprecated Use the typed result returned by sendOrderConfirmationSms. */
export class SmsRetryableError extends Error {
	constructor(readonly code: string) {
		super(code);
	}
}

/** @deprecated Use the typed result returned by sendOrderConfirmationSms. */
export class SmsAmbiguousError extends Error {
	constructor() {
		super("provider_ambiguous");
	}
}

function getStorefrontBaseUrl() {
	const value = process.env.STORE_PUBLIC_URL;
	if (!value) throw new Error("STORE_PUBLIC_URL is required");
	const url = new URL(value);
	if (
		url.protocol !== "https:" ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new Error("STORE_PUBLIC_URL must be a canonical https origin");
	}
	return url.origin;
}

export function buildOrderConfirmationSmsMessage(input: {
	orderNumber: string;
	total: number;
}) {
	const amount = `${input.total.toLocaleString("en-US")}₮`;
	const trackUrl = `${getStorefrontBaseUrl()}/order-tracking`;
	return `Захиалга #${input.orderNumber} баталгаажлаа. Нийт: ${amount}. Хянах: ${trackUrl}`;
}

export const classifyOrderConfirmationSmsState = (
	state: SmsState,
): BetterResult<void, DeliveryFailure> =>
	match(
		smsStateTags[state],
		"_tag",
	)<BetterResult<void, DeliveryFailure>>({
		Pending: () => Result.err(ambiguousDelivery("sms", "provider_unavailable")),
		Processed: () =>
			Result.err(ambiguousDelivery("sms", "provider_unavailable")),
		Sent: () => Result.ok(undefined),
		Delivered: () => Result.ok(undefined),
		Failed: () =>
			Result.err(retryableDeliveryFailure("sms", "provider_rejected")),
	});

export async function sendOrderConfirmationSms(
	input: OrderConfirmationSmsInput,
): Promise<BetterResult<void, DeliveryFailure>> {
	const phone = String(input.customerPhone);
	if (!MN_PHONE_RE.test(phone)) {
		return Result.err(invalidDelivery("sms", "invalid_recipient"));
	}

	const message = buildOrderConfirmationSmsMessage({
		orderNumber: input.orderNumber,
		total: input.total,
	});

	let response: unknown;
	try {
		response = await smsGateway.sendSmsAndWait({
			message,
			phoneNumbers: [`+976${phone}`],
		});
	} catch {
		// The provider can accept the SMS before the response is lost.
		return Result.err(ambiguousDelivery("sms", "network_failure"));
	}

	const parsed = v.safeParse(smsStateSchema, response);
	if (!parsed.success) {
		return Result.err(ambiguousDelivery("sms", "malformed_response"));
	}
	const result = classifyOrderConfirmationSmsState(parsed.output.state);
	if (result.status === "error") return result;

	logger.info("order.sms_confirmation_sent", {
		paymentNumber: input.paymentNumber,
		orderNumber: input.orderNumber,
		smsState: parsed.output.state,
	});
	return result;
}
