import * as v from "valibot";
import { assistantStockStatusSchema } from "./products";

// Channel-neutral cart domain for the customer assistant (ADR 0002/0007). All
// state transitions are pure functions over an immutable `Cart`; the agent app
// (apps/agent) owns persistence (a Cloudflare Durable Object, ADR 0006) and the
// channel wiring. Subtotal is computed from a price snapshot captured on the
// line at add time, so a later catalog price change never silently rewrites a
// cart the customer is already looking at, and the summary never needs a
// catalog round-trip.

// A single cart line. `price` is the unit price snapshot in MNT (integer
// tugriks) captured from the catalog projection when the item was first added.
export const cartItemSchema = v.object({
	productId: v.number(),
	name: v.string(),
	price: v.number(),
	image: v.optional(v.string()),
	brand: v.optional(v.string()),
	stockStatus: v.optional(assistantStockStatusSchema),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export type CartItem = v.InferOutput<typeof cartItemSchema>;

export const cartSchema = v.object({
	items: v.array(cartItemSchema),
	// The explicit checkout gate. No order is created until this flips true via
	// `confirmCart` (issue #21 ends at a confirmed cart; order creation is #23).
	confirmed: v.boolean(),
});

export type Cart = v.InferOutput<typeof cartSchema>;

export const EMPTY_CART: Cart = { items: [], confirmed: false };

// Default order quantity when a customer taps Захиалах (PRD).
export const DEFAULT_QUANTITY = 1;

// Hard cap so a stuck client tapping Захиалах cannot grow a line unbounded.
const MAX_QUANTITY = 99;

// Product fields needed to materialize a new cart line. Structurally a subset of
// the shared `AssistantProduct` projection (#19), so the catalog result can be
// passed straight through without a separate mapping.
export interface CartProductInput {
	id: number;
	name: string;
	price: number;
	image?: string;
	brand?: string;
	stockStatus?: v.InferOutput<typeof assistantStockStatusSchema>;
}

const clampQuantity = (quantity: number): number =>
	Math.max(1, Math.min(MAX_QUANTITY, Math.trunc(quantity)));

// Any mutation re-opens the confirm gate: a cart the customer just changed must
// be re-confirmed before checkout, so a stale confirmation can never leak into
// a later, different cart.
const reopen = (items: CartItem[]): Cart => ({ items, confirmed: false });

// Adds `quantity` of a product, merging into the existing line when present.
// Adding to a confirmed cart re-opens it (see `reopen`).
export const addToCart = (
	cart: Cart,
	product: CartProductInput,
	quantity: number = DEFAULT_QUANTITY,
): Cart => {
	const add = clampQuantity(quantity);
	const existing = cart.items.find((item) => item.productId === product.id);
	if (existing) {
		return reopen(
			cart.items.map((item) =>
				item.productId === product.id
					? { ...item, quantity: clampQuantity(item.quantity + add) }
					: item,
			),
		);
	}
	const line: CartItem = {
		productId: product.id,
		name: product.name,
		price: product.price,
		quantity: add,
		...(product.image ? { image: product.image } : {}),
		...(product.brand ? { brand: product.brand } : {}),
		...(product.stockStatus ? { stockStatus: product.stockStatus } : {}),
	};
	return reopen([...cart.items, line]);
};

// Sets an absolute quantity for a line. A quantity of 0 (or less) removes it.
export const setQuantity = (
	cart: Cart,
	productId: number,
	quantity: number,
): Cart => {
	if (quantity <= 0) return removeFromCart(cart, productId);
	return reopen(
		cart.items.map((item) =>
			item.productId === productId
				? { ...item, quantity: clampQuantity(quantity) }
				: item,
		),
	);
};

// Adjusts a line's quantity by a relative delta (e.g. +1 / -1 buttons).
// Dropping to 0 removes the line.
export const adjustQuantity = (
	cart: Cart,
	productId: number,
	delta: number,
): Cart => {
	const existing = cart.items.find((item) => item.productId === productId);
	if (!existing) return cart;
	return setQuantity(cart, productId, existing.quantity + delta);
};

export const removeFromCart = (cart: Cart, productId: number): Cart =>
	reopen(cart.items.filter((item) => item.productId !== productId));

export const clearCart = (_cart: Cart): Cart => ({ ...EMPTY_CART });

// Flips the explicit checkout gate. Confirming an empty cart is a no-op so a
// confirm tap on a cleared cart can never start a zero-item checkout.
export const confirmCart = (cart: Cart): Cart =>
	cart.items.length === 0 ? cart : { ...cart, confirmed: true };

export const cartItemCount = (cart: Cart): number =>
	cart.items.reduce((sum, item) => sum + item.quantity, 0);

export const cartSubtotal = (cart: Cart): number =>
	cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

export const isCartEmpty = (cart: Cart): boolean => cart.items.length === 0;

const formatPrice = (price: number): string =>
	`${Math.round(price).toLocaleString("en-US")}₮`;

export const CART_EMPTY_MESSAGE =
	"Таны сагс хоосон байна. Бараа хайгаад Захиалах товчийг дарж сагсандаа нэмнэ үү.";

export const CART_CONFIRMED_MESSAGE =
	"Таны захиалга баталгаажлаа. Бид удахгүй хүргэлтийн мэдээллийг тодруулна. Баярлалаа!";

// Renders the cart as a concise Mongolian summary: one line per item with unit
// price, quantity and line total, then the subtotal. Channel-neutral text the
// Messenger channel sends verbatim and a future web widget could render too.
export const formatCartSummary = (cart: Cart): string => {
	if (isCartEmpty(cart)) return CART_EMPTY_MESSAGE;
	const lines = cart.items.map((item, index) => {
		const lineTotal = item.price * item.quantity;
		return `${index + 1}. ${item.name} — ${formatPrice(item.price)} × ${item.quantity} = ${formatPrice(lineTotal)}`;
	});
	const subtotal = `Нийт: ${formatPrice(cartSubtotal(cart))} (${cartItemCount(cart)} ширхэг)`;
	const footer = cart.confirmed
		? "Төлөв: ✅ Баталгаажсан"
		: "Баталгаажуулахдаа доорх «Захиалга баталгаажуулах» товчийг дарна уу.";
	return ["🛒 Таны сагс:", ...lines, "", subtotal, footer].join("\n");
};

// ── Cart-control payloads ────────────────────────────────────────────────────
//
// Deterministic button/quick-reply payloads that drive the cart WITHOUT the
// model: the Messenger channel parses these in the webhook and mutates the cart
// directly. Kept here (next to the cart domain) so the payload grammar and the
// reducers that consume it cannot drift apart. The Захиалах add payload itself
// (`order_product:<id>`) stays in products.ts (#19) as the catalog card owns it.

export const CART_VIEW_PAYLOAD = "cart_view";
export const CART_CONFIRM_PAYLOAD = "cart_confirm";
export const CART_CLEAR_PAYLOAD = "cart_clear";

const CART_INC_PREFIX = "cart_inc";
const CART_DEC_PREFIX = "cart_dec";
const CART_REMOVE_PREFIX = "cart_remove";
const ID_RE = /^(\d+)$/;

export const buildCartIncPayload = (id: number): string =>
	`${CART_INC_PREFIX}:${id}`;
export const buildCartDecPayload = (id: number): string =>
	`${CART_DEC_PREFIX}:${id}`;
export const buildCartRemovePayload = (id: number): string =>
	`${CART_REMOVE_PREFIX}:${id}`;

export type CartCommand =
	| { kind: "view" }
	| { kind: "confirm" }
	| { kind: "clear" }
	| { kind: "inc"; productId: number }
	| { kind: "dec"; productId: number }
	| { kind: "set"; productId: number; quantity: number }
	| { kind: "remove"; productId: number };

const parseIdSuffix = (payload: string, prefix: string): number | undefined => {
	if (!payload.startsWith(`${prefix}:`)) return undefined;
	const match = ID_RE.exec(payload.slice(prefix.length + 1));
	if (!match) return undefined;
	const id = Number(match[1]);
	return Number.isSafeInteger(id) ? id : undefined;
};

// Parses a cart-control payload into a command, or `undefined` when the payload
// is not a cart-control payload (so the caller can fall through to other event
// handling — e.g. `order_product:<id>` or a normal text turn).
export const parseCartPayload = (payload: string): CartCommand | undefined => {
	if (payload === CART_VIEW_PAYLOAD) return { kind: "view" };
	if (payload === CART_CONFIRM_PAYLOAD) return { kind: "confirm" };
	if (payload === CART_CLEAR_PAYLOAD) return { kind: "clear" };
	const inc = parseIdSuffix(payload, CART_INC_PREFIX);
	if (inc !== undefined) return { kind: "inc", productId: inc };
	const dec = parseIdSuffix(payload, CART_DEC_PREFIX);
	if (dec !== undefined) return { kind: "dec", productId: dec };
	const remove = parseIdSuffix(payload, CART_REMOVE_PREFIX);
	if (remove !== undefined) return { kind: "remove", productId: remove };
	return undefined;
};

// Applies a parsed cart command to a cart. Pure: persistence is the caller's
// job. `view` returns the cart unchanged (read-only summary refresh).
export const applyCartCommand = (cart: Cart, command: CartCommand): Cart => {
	switch (command.kind) {
		case "view":
			return cart;
		case "confirm":
			return confirmCart(cart);
		case "clear":
			return clearCart(cart);
		case "inc":
			return adjustQuantity(cart, command.productId, 1);
		case "dec":
			return adjustQuantity(cart, command.productId, -1);
		case "set":
			return setQuantity(cart, command.productId, command.quantity);
		case "remove":
			return removeFromCart(cart, command.productId);
	}
};

// Channel-neutral quick-reply descriptor. The Messenger channel maps each onto
// a `quick_replies` entry (content_type 'text'); a web widget could render the
// same list as buttons.
export interface CartQuickReply {
	title: string;
	payload: string;
}

// Messenger allows at most 13 quick replies and caps each title at 20 chars.
const QUICK_REPLY_TITLE_MAX = 20;
const MAX_CART_QUICK_REPLIES = 13;

const truncateTitle = (text: string): string =>
	text.length <= QUICK_REPLY_TITLE_MAX
		? text
		: `${text.slice(0, QUICK_REPLY_TITLE_MAX - 1).trimEnd()}…`;

// Builds the cart-control quick replies for the current cart: per-item +/−/✖
// adjusters plus the global confirm/clear actions, bounded to Messenger's 13
// quick-reply cap (per-item controls are dropped first if the cart is large;
// the always-visible confirm/clear keep the customer able to act).
export const cartQuickReplies = (cart: Cart): CartQuickReply[] => {
	if (isCartEmpty(cart)) return [];
	const global: CartQuickReply[] = [
		{ title: "✅ Захиалга баталгаажуулах", payload: CART_CONFIRM_PAYLOAD },
		{ title: "🗑 Сагс хоослох", payload: CART_CLEAR_PAYLOAD },
	];
	const perItemBudget = MAX_CART_QUICK_REPLIES - global.length;
	const perItem: CartQuickReply[] = [];
	for (const item of cart.items) {
		if (perItem.length + 3 > perItemBudget) break;
		const label = truncateTitle(item.name);
		perItem.push(
			{ title: `➕ ${label}`, payload: buildCartIncPayload(item.productId) },
			{ title: `➖ ${label}`, payload: buildCartDecPayload(item.productId) },
			{ title: `✖ ${label}`, payload: buildCartRemovePayload(item.productId) },
		);
	}
	return [...perItem, ...global];
};
