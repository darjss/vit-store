import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";

import { normalizePhone, PHONE_RE, type CartLine } from "./cart";
import type { Env } from "./env";
import { storeClient, withTimeout } from "./store";

export type SearchHit = {
	amount?: string;
	brand?: string;
	dailyIntake?: string;
	expiry?: string;
	id: number;
	name: string;
	price: number;
	stock?: string;
	summary?: string;
};

// The conversation side supplies cart/checkout persistence and the recent
// customer texts set_delivery validates against. tools.ts stays free of SQL.
export type DeliveryPatch = { address?: string; note?: string; phone?: string };

export type DeliveryErrors = { address?: string; phone?: string };

export type CheckoutState = DeliveryPatch & { revision: number };

export type PaymentRow = {
	checkoutToken?: string;
	claimed: number;
	createdAt: number;
	orderNumber: string;
	paymentNumber: string;
	status: string;
};

export type ToolDeps = {
	cartLines(): Array<CartLine>;
	cartSet(productId: number, quantity: number): Promise<void>;
	checkout(): CheckoutState;
	latestPayment(): PaymentRow | undefined;
	recentCustomerTexts(): Array<string>;
	saveDelivery(input: DeliveryPatch): void;
};

export const replyInputSchema = v.object({
	action: v.optional(v.picklist(["confirm_order", "show_cart"])),
	productIds: v.optional(
		v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(10)),
	),
	text: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
});

export type ReplyResult = {
	action?: "confirm_order" | "show_cart";
	productIds?: Array<number>;
	text: string;
};

const ustr = (v: string | null | undefined): string | undefined => v || undefined;

// getProductsByIdsForAdvice rows: amount/brand/category/description are "",
// dailyIntake a number, expirationDate "" or an ISO string; search hits carry
// stockStatus ("in_stock" | "low_stock" | "out_of_stock") instead of stock.
const toHit = (p: {
	amount?: string | null;
	brand?: string | null;
	dailyIntake?: number | string | null;
	description?: string | null;
	expirationDate?: string | null;
	id: number;
	name: string;
	price: number;
	stockStatus?: string | null;
}): SearchHit => ({
	amount: ustr(p.amount),
	brand: ustr(p.brand),
	dailyIntake:
		p.dailyIntake === undefined || p.dailyIntake === null || p.dailyIntake === 0
			? undefined
			: String(p.dailyIntake),
	expiry: ustr(p.expirationDate)?.slice(0, 10),
	id: p.id,
	name: p.name,
	price: p.price,
	stock: ustr(p.stockStatus),
	summary: ustr(p.description)?.slice(0, 160),
});

const digitGroups = (text: string): Array<string> => text.match(/\d+/g) ?? [];

const significantWords = (text: string): Array<string> =>
	text
		.toLowerCase()
		.split(/[\s,.;:]+/)
		.filter((w) => w.length >= 3);

// set_delivery only accepts a phone/address the customer actually typed in
// this conversation: every digit group and every longer word of the address
// must appear in recent texts verbatim. Blocks hallucinated details.
const corroboratePhone = (phone: string, texts: Array<string>): boolean => {
	const haystack = texts.map((t) => t.replaceAll(/\D/g, "")).join("|");
	return haystack.includes(phone);
};

const corroborateAddress = (address: string, texts: Array<string>): boolean => {
	const haystack = texts.join(" ").toLowerCase();
	const digitHaystack = digitGroups(haystack);
	if (!digitGroups(address).every((g) => digitHaystack.includes(g))) {
		return false;
	}
	return significantWords(address).every((w) => haystack.includes(w));
};

export const createTools = (env: Env, deps: ToolDeps) => ({
	cart_set: tool({
		description:
			"Сагсанд бараа нэмэх эсвэл тоо хэмжээг өөрчлөх. quantity=0 бол устгана. Snapshot-г өөрөө авна.",
		execute: async ({ productId, quantity }) => {
			try {
				await deps.cartSet(productId, quantity);
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			const lines = deps.cartLines();
			return {
				items: lines.map((l) => ({
					name: l.name,
					price: l.price,
					productId: l.productId,
					qty: l.qty,
				})),
				subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
			};
		},
		inputSchema: valibotSchema(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				quantity: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(99)),
			}),
		),
	}),

	cart_view: tool({
		description: "Сагсны мөрүүд ба дэд нийтийг харах.",
		execute: async () => {
			const lines = deps.cartLines();
			return {
				items: lines.map((l) => ({
					name: l.name,
					price: l.price,
					productId: l.productId,
					qty: l.qty,
				})),
				subtotal: lines.reduce((s, l) => s + l.price * l.qty, 0),
			};
		},
		inputSchema: valibotSchema(v.object({})),
	}),

	handoff: tool({
		description:
			"Админ руу шилжүүлэх. Барааны гомдол, захиалга засах/цуцлах, эсвэл харилцагч хүнтэй ярихыг хүсвэл. Дуудсаны дараа reply хэрэггүй.",
		execute: async ({ reason }) => ({ handedOff: true, reason }),
		inputSchema: valibotSchema(
			v.object({ reason: v.pipe(v.string(), v.minLength(1), v.maxLength(300)) }),
		),
	}),

	order_status: tool({
		description: "Сүүлийн захиалгын явц, төлбөрийн төлөв.",
		execute: async () => {
			const payment = deps.latestPayment();
			if (!payment) {
				return { none: true as const };
			}
			let liveStatus = payment.status;
			try {
				const res = await storeClient(env).payment.getPaymentStatus.query(
					{
						checkoutToken: payment.checkoutToken ?? undefined,
						paymentNumber: payment.paymentNumber,
					},
					{ signal: withTimeout() },
				);
				liveStatus = res.status;
			} catch {
				// keep the last stored status
			}
			return {
				claimed: payment.claimed === 1,
				createdAt: new Date(payment.createdAt).toISOString(),
				orderNumber: payment.orderNumber,
				status: liveStatus,
			};
		},
		inputSchema: valibotSchema(v.object({})),
	}),

	product_details: tool({
		description: "Барааны дэлгэрэнгүй (id-аар, хамгийн ихдээ 5).",
		execute: async ({ ids }) => {
			const products = await storeClient(env).product.getProductsByIdsForAdvice.query(
				{ ids },
				{ signal: withTimeout() },
			);
			return products.map(toHit);
		},
		inputSchema: valibotSchema(
			v.object({
				ids: v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(5)),
			}),
		),
	}),

	reply: tool({
		description:
			"Харилцагч руу бичих цорын ганц арга. Байнга дуудна. action: 'show_cart' = сагсны самбар илгээх, 'confirm_order' = захиалгын баталгаажуулалт илгээх.",
		execute: async (params) => params,
		inputSchema: valibotSchema(replyInputSchema),
	}),

	search_products: tool({
		description: "Дэлгүүрийн каталогиос бараа хайх. Хайлтын үгийг англиар бич.",
		execute: async ({ query }) => {
			const store = storeClient(env);
			const hits = await store.product.searchProductsForAssistant.query(
				{ limit: 6, query },
				{ signal: withTimeout() },
			);
			if (hits.length === 0) {
				return [];
			}
			const details = await store.product.getProductsByIdsForAdvice.query(
				{ ids: hits.map((h) => h.id) },
				{ signal: withTimeout() },
			);
			const byId = new Map(details.map((d) => [d.id, d]));
			return hits.map((h) => {
				const detail = byId.get(h.id);
				return toHit({
					amount: detail?.amount,
					brand: detail?.brand ?? h.brand,
					dailyIntake: detail?.dailyIntake,
					description: detail?.description,
					expirationDate: detail?.expirationDate,
					id: h.id,
					name: detail?.name ?? h.name,
					price: detail?.price ?? h.price,
					stockStatus: h.stockStatus,
				});
			});
		},
		inputSchema: valibotSchema(
			v.object({ query: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) }),
		),
	}),

	set_delivery: tool({
		description:
			"Харилцагчийн бичсэн утас/хаяг/тэмдэглэлийг хадгалах. Харилцагчийн өгүүлбэрээс салгаж авна; missing-д дутуу талбарууд буцна.",
		execute: async (input) => {
			const texts = deps.recentCustomerTexts();
			const saved: Array<string> = [];
			const errors: DeliveryErrors = {};
			const out: DeliveryPatch = {};
			if (input.phone) {
				const phone = normalizePhone(input.phone);
				if (!PHONE_RE.test(phone)) {
					errors.phone = "invalid_phone";
				} else if (!corroboratePhone(phone, texts)) {
					errors.phone = "phone_not_in_customer_text";
				} else {
					out.phone = phone;
					saved.push("phone");
				}
			}
			if (input.address) {
				if (!corroborateAddress(input.address, texts)) {
					errors.address = "copy the address words exactly as the customer wrote them";
				} else {
					out.address = input.address;
					saved.push("address");
				}
			}
			if (input.note) {
				out.note = input.note;
				saved.push("note");
			}
			if (saved.length > 0) {
				deps.saveDelivery(out);
			}
			const checkout = deps.checkout();
			const missing: Array<"address" | "phone"> = [];
			if (!checkout.phone) {
				missing.push("phone");
			}
			if (!checkout.address) {
				missing.push("address");
			}
			return { errors, missing, saved };
		},
		inputSchema: valibotSchema(
			v.object({
				address: v.optional(v.pipe(v.string(), v.minLength(3), v.maxLength(500))),
				note: v.optional(v.pipe(v.string(), v.maxLength(300))),
				phone: v.optional(v.pipe(v.string(), v.maxLength(30))),
			}),
		),
	}),
});

export type ToolSet = ReturnType<typeof createTools>;
