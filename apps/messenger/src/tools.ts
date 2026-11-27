import { valibotSchema } from "@ai-sdk/valibot";
import { deliveryFee } from "@vit/shared/constants";
import { tool } from "ai";
import * as v from "valibot";

import { isCountrysideAddress, listingKey, normalizePhone, PHONE_RE, type CartLine } from "./cart";
import type { Checkout, Payment } from "./conversation-store";
import type { Env } from "./env";
import { storeClient, withTimeout } from "./store";

export type SearchHit = {
	amount?: string;
	brand?: string;
	dailyIntake?: string;
	expiry?: string;
	id: number;
	ingredients?: Array<string>;
	name: string;
	potency?: string;
	price: number;
	stock?: string;
	summary?: string;
};

export type DeliveryPatch = {
	address?: string;
	countryside?: boolean;
	note?: string;
	phone?: string;
};

export type DeliveryErrors = { address?: string; phone?: string };

export const paymentActionSchema = v.variant("kind", [
	v.object({ kind: v.literal("already_paid") }),
	v.object({ kind: v.literal("ambiguous") }),
	v.object({
		kind: v.literal("claim"),
		paymentNumber: v.string(),
		receiptAmount: v.optional(v.number()),
		replyText: v.optional(v.string()),
	}),
	v.object({ kind: v.literal("details"), paymentNumber: v.string() }),
	v.object({
		kind: v.literal("external_claim"),
		receiptAmount: v.optional(v.number()),
		replyText: v.optional(v.string()),
	}),
	v.object({ kind: v.literal("external_details") }),
	v.object({ kind: v.literal("total_unknown") }),
]);

export type PaymentAction = v.InferOutput<typeof paymentActionSchema>;

export const paymentToolOutputSchema = v.object({
	action: v.optional(paymentActionSchema),
	handled: v.boolean(),
});

export type CartItemInput = { productId: number; quantity: number };

export type ToolDeps = {
	cartLines(): Array<CartLine>;
	cartReplace(items: Array<CartItemInput>): Promise<void>;
	checkout(): Checkout;
	latestPayment(): Payment | undefined;
	markSeen(ids: Array<number>): void;
	onSearch(hits: Array<SearchHit>): void;
	pendingPayments(): Array<Payment>;
	recentCustomerTexts(): Array<string>;
	saveDelivery(input: DeliveryPatch): void;
};

export const replyInputSchema = v.object({
	action: v.optional(v.literal("confirm")),
	productIds: v.optional(
		v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(6)),
	),
	text: v.optional(v.pipe(v.string(), v.maxLength(140))),
});

export type ReplyResult = v.InferOutput<typeof replyInputSchema>;

export const handoffInputSchema = v.object({
	note: v.optional(v.pipe(v.string(), v.maxLength(200))),
	reason: v.pipe(v.string(), v.minLength(1), v.maxLength(300)),
});

export type HandoffResult = v.InferOutput<typeof handoffInputSchema>;

export const paymentInputSchema = v.object({
	kind: v.picklist(["claim", "details"]),
	needsTotal: v.optional(v.boolean()),
	receiptAmount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	replyText: v.optional(v.pipe(v.string(), v.maxLength(120))),
});

export type AdProduct = { id: number; name: string; price: number; stockStatus: string };

const ustr = (value: string | null | undefined): string | undefined => value || undefined;

const toHit = (p: {
	amount?: string | null;
	brand?: string | null;
	dailyIntake?: number | string | null;
	description?: string | null;
	expirationDate?: string | null;
	id: number;
	ingredients?: Array<string>;
	name: string;
	potency?: string | null;
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
	ingredients: p.ingredients?.length ? p.ingredients : undefined,
	name: p.name,
	potency: ustr(p.potency),
	price: p.price,
	stock: ustr(p.stockStatus),
	summary: ustr(p.description)?.slice(0, 160),
});

const digitGroups = (text: string): Array<string> => text.match(/\d+/g) ?? [];

// Normalize hyphens/punctuation so "42-р байр" matches "42р байр".
const normalizeAddressText = (text: string): string =>
	text
		.toLowerCase()
		.replaceAll(/[-–—/.,;:()№#]+/g, " ")
		.replaceAll(/(\d)\s+([рp]\b)/giu, "$1$2")
		.replaceAll(/\s+/g, " ")
		.trim();

const addressTokens = (text: string): Array<string> =>
	normalizeAddressText(text)
		.split(" ")
		.filter((w) => w.length >= 3 && !/^\d+$/.test(w));

const corroboratePhone = (phone: string, texts: Array<string>): boolean =>
	texts
		.map((t) => t.replaceAll(/\D/g, ""))
		.join("|")
		.includes(phone);

const corroborateAddress = (address: string, texts: Array<string>): boolean => {
	const haystack = normalizeAddressText(texts.join(" "));
	const haystackDigits = new Set(digitGroups(haystack));
	const addrDigits = digitGroups(address);
	if (!addrDigits.every((g) => haystackDigits.has(g))) {
		return false;
	}
	const tokens = addressTokens(address);
	if (tokens.length === 0) {
		return addrDigits.length > 0;
	}
	const matched = tokens.filter((w) => haystack.includes(w) || haystack.includes(w.slice(0, -1)));
	return matched.length / tokens.length >= 0.6;
};

const leadWithAdProducts = (hits: Array<SearchHit>, adProducts: Array<AdProduct>) => {
	const matched = adProducts.filter((ad) =>
		hits.some((h) => listingKey(h.name) === listingKey(ad.name)),
	);
	if (matched.length === 0) {
		return hits;
	}
	const keys = new Set(matched.map((ad) => listingKey(ad.name)));
	return [
		...matched.map((ad) => hits.find((h) => h.id === ad.id) ?? toHit(ad)),
		...hits.filter((h) => !keys.has(listingKey(h.name))),
	];
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;

export const createTools = (env: Env, deps: ToolDeps, adProducts: Array<AdProduct>) => ({
	cart_set: tool({
		description:
			"Сагсны бараануудыг нэг дор тохируулах (бүрэн шинэчилнэ). items=[] бол сагсыг хоосолно.",
		execute: async ({ items }) => {
			try {
				await deps.cartReplace(items);
			} catch (error) {
				return { error: error instanceof Error ? error.message : String(error) };
			}
			const lines = deps.cartLines();
			const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
			return {
				deliveryFee,
				items: lines.map((l) => ({
					name: l.name,
					price: l.price,
					productId: l.productId,
					qty: l.qty,
				})),
				subtotal,
				total: lines.length > 0 ? subtotal + deliveryFee : 0,
			};
		},
		inputSchema: valibotSchema(
			v.object({
				items: v.pipe(
					v.array(
						v.object({
							productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
							quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(20)),
						}),
					),
					v.maxLength(10),
				),
			}),
		),
	}),

	handoff: tool({
		description:
			"Админ руу шилжүүлэх. Бараа ирээгүй, гэмтэлтэй/буруу ирсэн, захиалга засах/цуцлах, гомдол, гааль/хууль, админд өгсөн захиалга олдсонгүй эсвэл хүнтэй ярих хүсэлт. Админд харагдах товч тайлбарыг note-д бич (харилцагчид илгээгдэхгүй). Дуудсаны дараа reply хэрэггүй.",
		execute: async ({ note, reason }) => ({ handedOff: true, note, reason }),
		inputSchema: valibotSchema(handoffInputSchema),
	}),

	order_status: tool({
		description: "Сүүлийн захиалгын явц, хүргэлт ба төлбөрийн төлөв шалгах.",
		execute: async () => {
			const payment = deps.latestPayment();
			if (!payment) {
				return { none: true as const };
			}
			let paymentStatus = payment.status;
			let orderStatus: string | undefined;
			try {
				const res = await storeClient(env).payment.getPaymentStatus.query(
					{
						checkoutToken: payment.checkoutToken,
						paymentNumber: payment.paymentNumber,
					},
					{ signal: withTimeout() },
				);
				paymentStatus = res.status;
				orderStatus = res.orderStatus;
			} catch {
				// Keep stored status if store query fails.
			}
			return {
				claimed: payment.claimed,
				countryside: payment.countryside,
				createdAt: new Date(payment.createdAt).toISOString(),
				orderNumber: payment.orderNumber,
				orderStatus,
				paymentStatus,
				total: payment.total,
			};
		},
		inputSchema: valibotSchema(v.object({})),
	}),

	payment: tool({
		description:
			'Төлбөр төлсөн тухай мэдэгдэл ("claim", баримтын зураг эсвэл "шилжүүлсэн") эсвэл дансны мэдээлэл илгээх ("details", "ирсэн, данс нь?"). Хэрэглэгч үнийн дүн/нийт хэд болохыг давхар асуусан бол needsTotal: true. Баримттай хамт асуулт бичсэн бол товч хариуг replyText-д бич.',
		execute: async ({ kind, needsTotal, receiptAmount, replyText }) => {
			const cleanReply = replyText?.trim() || undefined;
			const pendings = deps.pendingPayments();
			if (pendings.length === 0) {
				const latest = deps.latestPayment();
				const isRecentSameOrderClaim =
					latest !== undefined &&
					latest.status === "success" &&
					(kind === "details"
						? Date.now() - latest.createdAt < SEVEN_DAYS_MS
						: Date.now() - latest.createdAt < 30 * 60_000 &&
							(receiptAmount === undefined || receiptAmount === latest.total));
				if (isRecentSameOrderClaim) {
					return { action: { kind: "already_paid" } satisfies PaymentAction, handled: true };
				}
				const fallback: PaymentAction =
					kind === "claim"
						? { kind: "external_claim", receiptAmount, replyText: cleanReply }
						: needsTotal === true
							? { kind: "total_unknown" }
							: { kind: "external_details" };
				return { action: fallback, handled: true };
			}
			const pending = pendings[0];
			if (pendings.length > 1 || pending === undefined) {
				return { action: { kind: "ambiguous" } satisfies PaymentAction, handled: true };
			}
			const action: PaymentAction =
				kind === "claim"
					? {
							kind: "claim",
							paymentNumber: pending.paymentNumber,
							receiptAmount,
							replyText: cleanReply,
						}
					: { kind: "details", paymentNumber: pending.paymentNumber };
			return { action, handled: true };
		},
		inputSchema: valibotSchema(paymentInputSchema),
	}),

	product_details: tool({
		description:
			"Барааны бүрэн мэдээлэл: өдөрт уух тун, хэдэн хоног хүрэх, бүтэн тайлбар, найрлага, ангилал (id-аар, хамгийн ихдээ 5).",
		execute: async ({ ids }) => {
			const products = await storeClient(env).product.getProductsByIdsForAdvice.query(
				{ ids },
				{ signal: withTimeout() },
			);
			deps.markSeen(products.map((p) => p.id));
			return products.map((p) => ({
				...toHit(p),
				category: ustr(p.category),
				description: ustr(p.description),
				summary: undefined,
			}));
		},
		inputSchema: valibotSchema(
			v.object({
				ids: v.pipe(
					v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
					v.minLength(1),
					v.maxLength(5),
				),
			}),
		),
	}),

	reply: tool({
		description:
			"Харилцагч руу бичих цорын ганц арга. action: 'confirm' үед хураангуй болон товчийг код илгээнэ (нэмэлт асуултгүй бол text хоосон орхи).",
		execute: async (params) => params,
		inputSchema: valibotSchema(replyInputSchema),
	}),

	search_products: tool({
		description:
			"Дэлгүүрийн каталогиос бараа хайх (1-3 англи үг, олон бараанд 4 хүртэл зэрэг дуудаж болно).",
		execute: async ({ query }) => {
			const store = storeClient(env);
			const hits = await store.product.searchProductsForAssistant.query(
				{ limit: 8, query },
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
			const found = hits.flatMap((h) => {
				const detail = byId.get(h.id);
				// Drop stale Upstash hits for deleted or inactive Postgres rows,
				// and always trust live Postgres stockStatus over the search cache.
				if (detail === undefined) {
					return [];
				}
				return [
					toHit({
						amount: detail.amount,
						brand: detail.brand || h.brand,
						dailyIntake: detail.dailyIntake,
						description: detail.description,
						expirationDate: detail.expirationDate,
						id: h.id,
						ingredients: detail.ingredients,
						name: detail.name || h.name,
						potency: detail.potency,
						price: detail.price,
						stockStatus: detail.stockStatus,
					}),
				];
			});
			const ordered = leadWithAdProducts(found, adProducts);
			deps.markSeen(ordered.map((h) => h.id));
			deps.onSearch(ordered);
			return ordered;
		},
		inputSchema: valibotSchema(
			v.object({ query: v.pipe(v.string(), v.minLength(1), v.maxLength(200)) }),
		),
	}),

	set_delivery: tool({
		description:
			"Харилцагчийн бичсэн утас/хаяг/тэмдэглэлийг хадгалах. Улаанбаатараас гадна бол countryside: true; УБ хаяг руу засвал countryside: false.",
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
					errors.address = "copy the address words as the customer wrote them";
				} else {
					out.address = input.address;
					saved.push("address");
				}
			}
			if (input.note) {
				out.note = input.note;
				saved.push("note");
			}
			if (input.countryside !== undefined) {
				out.countryside = input.countryside;
				saved.push("countryside");
			} else if (out.address !== undefined && isCountrysideAddress(out.address)) {
				out.countryside = true;
				saved.push("countryside");
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
				countryside: v.optional(v.boolean()),
				note: v.optional(v.pipe(v.string(), v.maxLength(300))),
				phone: v.optional(v.pipe(v.string(), v.maxLength(30))),
			}),
		),
	}),
});

export type MessengerToolSet = ReturnType<typeof createTools>;
