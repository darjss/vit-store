import {
	ambiguousDelivery,
	type DeliveryFailure,
	invalidDelivery,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import { sendEmail } from "~/lib/integrations/resend/client";
import { smsGateway } from "~/lib/integrations/sms/client";
import { buildProductPdpUrl } from "~/lib/restock/url";

const phoneSchema = v.pipe(v.string(), v.regex(/^[6-9]\d{7}$/));
const emailSchema = v.pipe(v.string(), v.email());
const smsStateSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	state: v.picklist(["Pending", "Processed", "Sent", "Delivered", "Failed"]),
});

type SmsState = v.InferOutput<typeof smsStateSchema>;

const smsStateTags = {
	Pending: { _tag: "Pending" },
	Processed: { _tag: "Processed" },
	Sent: { _tag: "Sent" },
	Delivered: { _tag: "Delivered" },
	Failed: { _tag: "Failed" },
} as const satisfies Record<SmsState["state"], { _tag: SmsState["state"] }>;

export type RestockDeliveryReceipt = {
	providerId: string;
};

export const classifyRestockSmsState = (
	state: SmsState,
): BetterResult<RestockDeliveryReceipt, DeliveryFailure> =>
	match(
		smsStateTags[state.state],
		"_tag",
	)<BetterResult<RestockDeliveryReceipt, DeliveryFailure>>({
		Pending: () => Result.ok({ providerId: state.id }),
		Processed: () => Result.ok({ providerId: state.id }),
		Sent: () => Result.ok({ providerId: state.id }),
		Delivered: () => Result.ok({ providerId: state.id }),
		Failed: () =>
			Result.err(retryableDeliveryFailure("sms", "provider_rejected")),
	});

export async function sendRestockNotification(input: {
	channel: "sms" | "email";
	contact: string;
	productName: string;
	productSlug: string;
	productId: number;
	deliveryKey: string;
}): Promise<BetterResult<RestockDeliveryReceipt, DeliveryFailure>> {
	const pdpUrl = buildProductPdpUrl(input.productSlug, input.productId);
	const message = `${input.productName} дахин орлоо. Захиалах: ${pdpUrl}`;

	if (input.channel === "sms") {
		if (!v.safeParse(phoneSchema, input.contact).success) {
			return Result.err(invalidDelivery("sms", "invalid_recipient"));
		}
		let response: unknown;
		try {
			response = await smsGateway.sendSms({
				message,
				phoneNumbers: [`+976${input.contact}`],
			});
		} catch {
			return Result.err(ambiguousDelivery("sms", "network_failure"));
		}
		const parsed = v.safeParse(smsStateSchema, response);
		if (!parsed.success) {
			return Result.err(ambiguousDelivery("sms", "malformed_response"));
		}
		return classifyRestockSmsState(parsed.output);
	}

	if (!v.safeParse(emailSchema, input.contact).success) {
		return Result.err(invalidDelivery("email", "invalid_recipient"));
	}
	const result = await sendEmail({
		to: input.contact,
		subject: `${input.productName} дахин орлоо`,
		text: `${input.productName} дахин орлоо.\n\nЗахиалах холбоос: ${pdpUrl}`,
		idempotencyKey: input.deliveryKey,
	});
	return result.map(({ id }) => ({ providerId: id }));
}
