import { valibotSchema } from "@ai-sdk/valibot";
import { deliveryFee } from "@vit/shared/constants";
import { tool } from "ai";
import * as v from "valibot";

import {
	isCountrysideAddress,
	listingKey,
	normalizePhone,
	PHONE_RE,
	phonesInText,
	type CartLine,
} from "./cart";
import type { Checkout, Payment } from "./conversation-store";
import type { Env } from "./env";
import { botClient, storeClient, withTimeout } from "./store";

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

const paymentItemSchema = v.object({
	name: v.string(),
	price: v.number(),
	qty: v.number(),
});

export const paymentActionSchema = v.variant("kind", [
	v.object({ kind: v.literal("already_paid") }),
	v.object({ kind: v.literal("ambiguous") }),
	v.object({
		items: v.array(paymentItemSchema),
		kind: v.literal("catalog_details"),
		phone: v.optional(v.string()),
		total: v.number(),
	}),
	v.object({
		kind: v.literal("claim"),
		paymentNumber: v.string(),
		receiptAmount: v.optional(v.number()),
		replyText: v.optional(v.string()),
	}),
	v.object({
		items: v.array(paymentItemSchema),
		kind: v.literal("db_order_details"),
		orderNumber: v.string(),
		phone: v.string(),
		total: v.number(),
	}),
	v.object({ kind: v.literal("details"), paymentNumber: v.string() }),
	v.object({
		kind: v.literal("external_claim"),
		orderNumber: v.optional(v.string()),
		phone: v.optional(v.string()),
		receiptAmount: v.optional(v.number()),
		replyText: v.optional(v.string()),
		total: v.optional(v.number()),
	}),
	v.object({ kind: v.literal("external_details"), phone: v.optional(v.string()) }),
	v.object({ kind: v.literal("total_unknown"), phone: v.optional(v.string()) }),
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
	quotedProductIds: v.optional(
		v.pipe(v.array(v.pipe(v.number(), v.integer(), v.minValue(1))), v.maxLength(6)),
	),
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
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60_000;

const findCustomerPhone = (deps: ToolDeps): string | undefined => {
	const saved = deps.checkout().phone;
	if (saved && PHONE_RE.test(saved)) {
		return saved;
	}
	for (const text of deps.recentCustomerTexts()) {
		const found = phonesInText(text)[0];
		if (found) {
			return found;
		}
	}
	return undefined;
};

type DbOrderLookup = {
	items: Array<{ name: string; price: number; qty: number }>;
	orderNumber: string;
	paymentStatus: string;
	phone: string;
	total: number;
};

const lookupDbOrdersByPhone = async (env: Env, phone: string): Promise<Array<DbOrderLookup>> => {
	const client = botClient(env);
	if (client === undefined) {
		return [];
	}
	try {
		const res = await client.order.getPaginatedOrders.query(
			{
				createdAfter: new Date(Date.now() - FOURTEEN_DAYS_MS),
				page: 1,
				pageSize: 10,
				searchTerm: phone,
			},
			{ signal: withTimeout() },
		);
		return res.orders
			.filter(
				(o) =>
					String(o.customerPhone) === phone && o.status !== "cancelled" && o.status !== "refunded",
			)
			.map((o) => ({
				items: o.products.map((p) => ({ name: p.name, price: p.price, qty: p.quantity })),
				orderNumber: o.orderNumber,
				paymentStatus: o.paymentStatus,
				phone,
				total: o.total,
			}));
	} catch {
		return [];
	}
};

const quoteCatalogProducts = async (
	env: Env,
	productIds: Array<number>,
): Promise<
	{ items: Array<{ name: string; price: number; qty: number }>; total: number } | undefined
> => {
	const counts = new Map<number, number>();
	for (const id of productIds) {
		counts.set(id, (counts.get(id) ?? 0) + 1);
	}
	const uniqueIds = [...counts.keys()];
	if (uniqueIds.length === 0) {
		return undefined;
	}
	try {
		const products = await storeClient(env).product.getProductsByIdsForAssistant.query(
			{ ids: uniqueIds },
			{ signal: withTimeout() },
		);
		const byId = new Map(products.map((p) => [p.id, p]));
		if (uniqueIds.some((id) => !byId.has(id))) {
			return undefined;
		}
		const items = uniqueIds.map((id) => {
			const p = byId.get(id)!;
			return { name: p.name, price: p.price, qty: counts.get(id) ?? 1 };
		});
		const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
		return { items, total: subtotal + deliveryFee };
	} catch {
		return undefined;
	}
};

const isRecentSameOrderPayment = (
	latest: Payment | undefined,
	kind: "claim" | "details",
	receiptAmount?: number,
): boolean => {
	if (latest === undefined || latest.status !== "success") {
		return false;
	}
	const age = Date.now() - latest.createdAt;
	if (kind === "details") {
		return age < SEVEN_DAYS_MS;
	}
	return age < 30 * 60_000 && (receiptAmount === undefined || receiptAmount === latest.total);
};

const resolveDetailsWithoutPending = async (
	env: Env,
	dbOrders: Array<DbOrderLookup>,
	opts: { needsTotal?: boolean; phone?: string; quotedProductIds?: Array<number> },
): Promise<PaymentAction> => {
	const unpaidDb = dbOrders.filter((o) => o.paymentStatus !== "success");
	if (unpaidDb.length === 1 && unpaidDb[0] !== undefined) {
		const match = unpaidDb[0];
		return {
			items: match.items,
			kind: "db_order_details",
			orderNumber: match.orderNumber,
			phone: match.phone,
			total: match.total,
		};
	}
	if (unpaidDb.length > 1) {
		return { kind: "ambiguous" };
	}
	if (dbOrders.some((o) => o.paymentStatus === "success")) {
		return { kind: "already_paid" };
	}
	if (opts.quotedProductIds && opts.quotedProductIds.length > 0) {
		const quoted = await quoteCatalogProducts(env, opts.quotedProductIds);
		if (quoted !== undefined) {
			return {
				items: quoted.items,
				kind: "catalog_details",
				phone: opts.phone,
				total: quoted.total,
			};
		}
	}
	return opts.needsTotal === true
		? { kind: "total_unknown", phone: opts.phone }
		: { kind: "external_details", phone: opts.phone };
};

const resolveNoPendingPayment = async (
	env: Env,
	deps: ToolDeps,
	input: {
		cleanReply?: string;
		kind: "claim" | "details";
		needsTotal?: boolean;
		quotedProductIds?: Array<number>;
		receiptAmount?: number;
	},
): Promise<PaymentAction> => {
	if (isRecentSameOrderPayment(deps.latestPayment(), input.kind, input.receiptAmount)) {
		return { kind: "already_paid" };
	}
	const phone = findCustomerPhone(deps);
	const dbOrders = phone ? await lookupDbOrdersByPhone(env, phone) : [];
	if (input.kind === "claim") {
		const unpaidDb = dbOrders.filter((o) => o.paymentStatus !== "success");
		const single = unpaidDb.length === 1 ? unpaidDb[0] : undefined;
		return {
			kind: "external_claim",
			orderNumber: single?.orderNumber,
			phone,
			receiptAmount: input.receiptAmount,
			replyText: input.cleanReply,
			total: single?.total,
		};
	}
	return resolveDetailsWithoutPending(env, dbOrders, {
		needsTotal: input.needsTotal,
		phone,
		quotedProductIds: input.quotedProductIds,
	});
};

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
			'Төлбөр төлсөн тухай мэдэгдэл ("claim", баримтын зураг эсвэл "шилжүүлсэн") эсвэл дансны мэдээлэл илгээх ("details", "ирсэн, данс нь?"). Хэрэглэгч үнийн дүн/нийт хэд болохыг давхар асуусан бол needsTotal: true. Системд захиалгагүй ч хэрэглэгч яг авсан бараагаа тодорхой нэрлэсэн бөгөөд хямдрал тохироогүй бол search_products-аас олдсон id-г quotedProductIds-д дамжуул. Баримттай хамт асуулт бичсэн бол товч хариуг replyText-д бич.',
		execute: async ({ kind, needsTotal, quotedProductIds, receiptAmount, replyText }) => {
			const cleanReply = replyText?.trim() || undefined;
			const pendings = deps.pendingPayments();
			if (pendings.length === 0) {
				const action = await resolveNoPendingPayment(env, deps, {
					cleanReply,
					kind,
					needsTotal,
					quotedProductIds,
					receiptAmount,
				});
				return { action, handled: true };
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
