import { valibotSchema } from "@ai-sdk/valibot";
import { generateText, type LanguageModel, Output, type UserContent } from "ai";
import * as v from "valibot";
import { providerOptions } from "../model";

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
	id: number;
	name: string;
	potency: string;
	price: number;
};

const extractedOrderSchema = v.object({
	address: v.nullable(v.string()),
	cancelled: v.boolean(),
	cancelledAtMsg: v.nullable(v.number()),
	confirmedAtMsg: v.number(),
	deliveryFee: v.nullable(v.number()),
	items: v.array(
		v.object({
			label: v.string(),
			productId: v.nullable(v.number()),
			qty: v.number(),
			unitPrice: v.nullable(v.number()),
		}),
	),
	paymentSent: v.boolean(),
	paymentSentMsg: v.nullable(v.number()),
	phone: v.nullable(v.string()),
	pickup: v.boolean(),
	quotedTotal: v.nullable(v.number()),
});

const extractionSchema = v.object({ orders: v.array(extractedOrderSchema) });

export type ExtractedOrder = v.InferOutput<typeof extractedOrderSchema>;

const instructions = (
	catalog: Array<CatalogProduct>,
) => `You read a Facebook Messenger chat from "Amerik huns baraa", a Mongolian shop that sells imported vitamins and supplements. ADMIN messages are the shop's admin typing by hand. CUSTOMER messages are the buyer. Messages are numbered #0, #1, ... and photos follow the message they belong to.

Return every confirmed order in the chat. An order is confirmed when all three hold:
1. The customer gave a phone number.
2. The customer gave a delivery address, or clearly chose pick-up.
3. The admin agreed after both were given: said za/ok/болсон, quoted a total, or sent bank account details. An earlier "za, leave your phone and address" does not count.

Questions, price checks and chats that stop before all three are not orders. Return {"orders": []} for them. A chat can hold more than one order, for example a repeat order days later. Changes before the admin's final quote are one order with the final contents.

Fields:
- confirmedAtMsg: the number of the first admin agreement after phone and address are both in the chat. If the admin never replied after the details, the message that completed them.
- items: one per product. productId is the catalog id below, or null when you can't tell which product it is. label is the product as written or shown. qty is the count. unitPrice is the admin's price for one unit in ₮, or null.
- Products often appear only in photos: price-tagged grids, circled bottles, or the customer's own bottle. Admin product photos usually come right before "this one" style replies. Match them to the catalog by brand, name, potency and pack size. When the photo or text is unclear, use the admin's prices to decide between candidates. Prices in the chat can differ from the catalog by a few thousand.
- quotedTotal: the admin's final total in ₮. Admins write thousands, so "120+5=125" is 125000 and the delivery fee is 5000. Other forms: "13*70=910+5", a bare "240k", or the customer's own sum the admin confirms. null if no total was ever stated.
- deliveryFee: the delivery fee in the quote in ₮, or null.
- phone: the delivery phone, digits only.
- address: the delivery address, shortened to one line, as written.
- pickup: true if the customer picks it up.
- paymentSent: true only if the customer says they paid or sends a bank transfer screenshot after the order. paymentSentMsg is that message's number.
- cancelled: true if the customer or admin called the order off after it was confirmed and before delivery. cancelledAtMsg is that message's number.

When the chat can't settle a field, use null. Don't guess.

Catalog (id | brand | name | potency | amount | price ₮):
${catalog.map((p) => `${p.id} | ${p.brand} | ${p.name} | ${p.potency} | ${p.amount} | ${p.price}`).join("\n")}`;

const ubTime = (iso: string) =>
	new Date(new Date(iso).getTime() + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ");

const chatContent = (messages: Array<ChatMessage>): UserContent =>
	messages.flatMap((m, i) => [
		{
			text: `#${i} ${ubTime(m.at)} ${m.direction === "incoming" ? "CUSTOMER" : "ADMIN"}: ${m.text}${m.photos.length > 0 ? ` [${m.photos.length} photo]` : ""}`,
			type: "text" as const,
		},
		...m.photos.map((p) => ({ image: p.data, mediaType: p.mediaType, type: "image" as const })),
	]);

export const extractOrders = async (input: {
	catalog: Array<CatalogProduct>;
	messages: Array<ChatMessage>;
	model: LanguageModel;
}) => {
	const { output } = await generateText({
		messages: [{ content: chatContent(input.messages), role: "user" }],
		model: input.model,
		output: Output.object({ schema: valibotSchema(extractionSchema) }),
		providerOptions,
		system: instructions(input.catalog),
		temperature: 0,
	});
	const known = new Set(input.catalog.map((p) => p.id));
	// A productId the catalog doesn't have is a model slip, not a product.
	return output.orders.map((o) => ({
		...o,
		items: o.items.map((i) => ({
			...i,
			productId: i.productId !== null && known.has(i.productId) ? i.productId : null,
		})),
	}));
};
