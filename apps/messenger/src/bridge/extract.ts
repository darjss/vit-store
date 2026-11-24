import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, type LanguageModel, Output, type UserContent } from "ai";
import * as v from "valibot";

// Reads one hand-answered Messenger chat and returns the orders the admin
// confirmed in it. The model only reads; code decides what to write or send.

export type ChatMessage = {
	at: string;
	direction: "incoming" | "outgoing";
	photos: Array<{ data: Uint8Array; mediaType: string }>;
	text: string;
};

export type CatalogProduct = {
	amount: string;
	brand: string;
	compare_at_price?: number | null;
	id: number;
	name: string;
	name_mn?: string | null;
	potency: string;
	price: number;
	status?: string;
};

export type ReasoningEffort = "high" | "low" | "medium" | "none";

const extractedOrderSchema = v.strictObject({
	address: v.nullable(v.string()),
	cancelled: v.boolean(),
	cancelledAtMsg: v.nullable(v.number()),
	confirmedAtMsg: v.number(),
	deliveryFee: v.nullable(v.number()),
	items: v.array(
		v.strictObject({
			label: v.string(),
			productId: v.nullable(v.number()),
			qty: v.number(),
			unitPrice: v.nullable(v.number()),
		}),
	),
	paidAmount: v.nullable(v.number()),
	paymentSent: v.boolean(),
	paymentSentMsg: v.nullable(v.number()),
	phone: v.nullable(v.string()),
	pickup: v.boolean(),
	quotedTotal: v.nullable(v.number()),
});

const extractionSchema = v.strictObject({ orders: v.array(extractedOrderSchema) });

export type ExtractedOrder = v.InferOutput<typeof extractedOrderSchema>;

const formatCatalogRow = (p: CatalogProduct) => {
	const name = p.name_mn ? `${p.name} (${p.name_mn})` : p.name;
	const price =
		p.compare_at_price && p.compare_at_price !== p.price
			? `${p.price} (reg ${p.compare_at_price})`
			: String(p.price);
	const status = p.status ?? "";
	return `${p.id} | ${p.brand} | ${name} | ${p.potency} | ${p.amount} | ${price}${status ? ` | ${status}` : ""}`;
};

const instructions = (
	catalog: Array<CatalogProduct>,
) => `You read a Facebook Messenger chat from "Amerik huns baraa", a Mongolian shop that sells imported vitamins and supplements. ADMIN messages are the shop's admin typing by hand. CUSTOMER messages are the buyer. Messages are numbered #0, #1, ... and photos follow the message they belong to. Messages marked "[empty]" had no captured text or photo (often a thumbs-up, sticker, or an uncaptured historical attachment).

Return every confirmed order in the chat. An order is confirmed when all three hold:
1. The customer gave a phone number.
2. The customer gave a delivery address, or clearly chose pick-up.
3. The admin agreed to take the order: either replied after phone and address were given (said za/ok/болсон, scheduled delivery, quoted a total, or sent bank details), OR agreed beforehand by asking for the customer's address and phone ("hayag utsaa uldeegeerei") and the customer then provided both.

Questions, price checks, and chats where phone or address/pick-up is missing are not orders. Return {"orders": []} for them. A chat can hold more than one order, for example a repeat order days later. Changes before the admin's final quote are one order with the final contents.

Fields:
- confirmedAtMsg: the message number of the first admin agreement after phone and address are both in the chat. If the admin agreed beforehand (e.g. asked for address and phone) and never sent a text reply after both were given, use the customer message that completed phone and address.
- items: one entry per product.
  - productId: the catalog id below, or null when no catalog item matches or multiple distinct products tie.
  - Products often appear only in photos (price-tagged grids, circled bottles, customer's bottle) or brief Mongolian/English text. Match by brand, name/Mongolian name, potency, pack size, and the admin's unit price.
  - Even when photos are missing, match the product if the mentioned brand/type/potency plus the admin's unit price uniquely identifies one catalog product. Prices in chat can differ from catalog prices by a few thousand; prices listed as "X (reg Y)" show a sale price and regular price — match against either.
  - Duplicate catalog listings: when two rows represent the exact same product at the same price (matching either the listed price or the "reg" price), prefer status "active" over "out_of_stock", and "out_of_stock" over "draft". When prices differ, prefer the row whose price (or "reg" price) matches the chat/photo price.
  - label: the product as written or shown. qty: count. unitPrice: the admin's price for one unit in ₮, or null.
- quotedTotal: the admin's final full order total in ₮ (never replace it with a partial payment, deposit, or remaining-balance amount). Admins write thousands, so "120+5=125" is 125000 and deliveryFee is 5000. Other forms: "13*70=910+5", StorePay "+11%=111", a bare "240k", or the customer's own sum the admin confirms. null if no total was ever stated.
- deliveryFee: the delivery fee in the quote in ₮, or null.
- phone: the delivery phone, digits only (first phone if the customer gave two).
- address: the delivery address, shortened to one line, as written.
- pickup: true if the customer picks it up.
- paymentSent: true ONLY when the full order is paid — after the order the customer says they paid the full amount, sends a bank transfer screenshot for the full total, sends a StorePay / zary.mn confirmation or delivery code ("Baraa huleeltseh kod"), OR sends an "[empty]" message right after bank details that is clearly a payment receipt (followed by customer thanks and admin "Za bayarlalaa", with no later payment reminder). If the customer only paid a partial amount / deposit (e.g. "250k hiichihlee", "daraa ni 135", or admin still chasing an unpaid remainder), set paymentSent to false and put the paid portion in paidAmount. paymentSentMsg is the message number of the full-payment proof/statement (null if only partially paid or unpaid).
- paidAmount: amount in ₮ the customer actually paid when explicitly stated (especially on a partial payment like 250000 out of a 385000 order, or from a receipt/transfer message), or null if unpaid or no amount was stated.
- cancelled: true only if the customer or admin explicitly cancels the order (e.g. "болилоо", "цуцаллаа", bought elsewhere) after confirmation and before delivery. A stock-delay notice ("irsengui ee" / hasn't arrived yet) without explicit cancellation is not cancelled. cancelledAtMsg is that message's number.

When the chat truly can't settle a field, use null. Don't invent values.

Catalog (id | brand | name | potency | amount | price ₮ | status):
${catalog.map(formatCatalogRow).join("\n")}`;

const ubTime = (iso: string) =>
	new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");

const chatContent = (messages: Array<ChatMessage>): UserContent =>
	messages.flatMap((m, i) => {
		const body = m.text || (m.photos.length > 0 ? "" : "[empty]");
		const photoTag = m.photos.length > 0 ? ` [${m.photos.length} photo]` : "";
		return [
			{
				text: `#${i} ${ubTime(m.at)} ${m.direction === "incoming" ? "CUSTOMER" : "ADMIN"}: ${body}${photoTag}`,
				type: "text" as const,
			},
			...m.photos.map((p) => ({
				image: p.data,
				mediaType: p.mediaType,
				type: "image" as const,
			})),
		];
	});

const normalizePhone = (phone: string | null): string | null => {
	if (phone === null) {
		return null;
	}
	const digits = phone.replaceAll(/\D/g, "");
	if (digits.length === 11 && digits.startsWith("976")) {
		return digits.slice(3);
	}
	return digits.length > 0 ? digits : null;
};

export const extractOrders = async (input: {
	catalog: Array<CatalogProduct>;
	messages: Array<ChatMessage>;
	model: LanguageModel;
	reasoningEffort?: ReasoningEffort;
}) => {
	const effort = input.reasoningEffort ?? "low";
	const { output, usage } = await generateText({
		messages: [{ content: chatContent(input.messages), role: "user" }],
		model: input.model,
		output: Output.object({ schema: valibotSchema(extractionSchema) }),
		providerOptions: { openai: { reasoningEffort: effort } },
		system: instructions(input.catalog),
	});
	const known = new Set(input.catalog.map((p) => p.id));
	// A productId the catalog doesn't have is a model slip, not a product.
	const orders = output.orders.map((o) => ({
		...o,
		items: o.items.map((i) => ({
			...i,
			productId: i.productId !== null && known.has(i.productId) ? i.productId : null,
		})),
		phone: normalizePhone(o.phone),
	}));
	return { orders, usage };
};
