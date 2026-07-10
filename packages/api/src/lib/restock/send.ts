import { sendEmail, smsGateway } from "~/lib/integrations";
import { buildProductPdpUrl } from "~/lib/restock/url";

export async function sendRestockNotification(input: {
	channel: "sms" | "email";
	contact: string;
	productName: string;
	productSlug: string;
	productId: number;
	deliveryKey: string;
}) {
	const pdpUrl = buildProductPdpUrl(input.productSlug, input.productId);
	const message = `${input.productName} дахин орлоо. Захиалах: ${pdpUrl}`;

	if (input.channel === "sms") {
		const smsFinalState = await smsGateway.sendSms({
			message,
			phoneNumbers: [`+976${input.contact}`],
		});

		if (smsFinalState.state === "Failed") {
			throw new Error(smsFinalState.recipients[0]?.error ?? "SMS failed");
		}

		return;
	}

	await sendEmail({
		to: input.contact,
		subject: `${input.productName} дахин орлоо`,
		text: `${input.productName} дахин орлоо.\n\nЗахиалах холбоос: ${pdpUrl}`,
		idempotencyKey: input.deliveryKey,
	});
}
