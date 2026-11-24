import {
	sanitizeSmsLatin,
	sendEmail,
	sendSms,
	WESEND_LATIN_PART_SIZE,
	WESEND_MAX_PARTS,
} from "~/lib/integrations";
import { buildProductPdpUrl } from "~/lib/restock/url";

const MIN_PRODUCT_NAME_CHARS = 24;

function truncateLabel(text: string, maxChars: number) {
	if (text.length <= maxChars) {
		return text;
	}
	if (maxChars <= 3) {
		return text.slice(0, Math.max(0, maxChars));
	}
	return `${text.slice(0, maxChars - 3).trimEnd()}...`;
}

// Pure Latin ASCII: fits in 1 WeSend part (155 chars = 80 MNT) whenever the PDP URL allows,
// and never exceeds WeSend's 4-part cap (620 chars).
function buildRestockSmsMessage(productName: string, pdpUrl: string) {
	const prefix = "Amerik Vitamin: ";
	const suffix = ` dahin orloo! Zahialah: ${pdpUrl}`;
	const cleanName = sanitizeSmsLatin(productName) || "Baraa";
	const overhead = prefix.length + suffix.length;
	const singlePartBudget = WESEND_LATIN_PART_SIZE - overhead;
	const nameBudget =
		singlePartBudget >= MIN_PRODUCT_NAME_CHARS
			? singlePartBudget
			: WESEND_LATIN_PART_SIZE * WESEND_MAX_PARTS - overhead;
	return `${prefix}${truncateLabel(cleanName, nameBudget)}${suffix}`;
}

export async function sendRestockNotification(input: {
	channel: "sms" | "email";
	contact: string;
	productId: number;
	productName: string;
	productSlug: string;
}) {
	const pdpUrl = buildProductPdpUrl(input.productSlug, input.productId);

	if (input.channel === "sms") {
		await sendSms({
			text: buildRestockSmsMessage(input.productName, pdpUrl),
			to: input.contact,
		});
		return;
	}

	await sendEmail({
		subject: `${input.productName} дахин орлоо`,
		text: `${input.productName} дахин орлоо.\n\nЗахиалах холбоос: ${pdpUrl}`,
		to: input.contact,
	});
}
