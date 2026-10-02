import * as v from "valibot";

// Ported from packages/assistant/src/cart.ts + products.ts (the package's root
// re-exports pull in @flue/runtime, which this worker does not use). Payload
// strings are identical to the old channel grammar.

export type CartLine = { name: string; price: number; productId: number; qty: number };

const mnt = (amount: number): string => `${Math.round(amount).toLocaleString("en-US")}₮`;

export const cartSubtotal = (lines: Array<CartLine>): number =>
	lines.reduce((s, l) => s + l.price * l.qty, 0);

export const formatCartSummary = (lines: Array<CartLine>): string => {
	const items = lines.map(
		(item, index) =>
			`${index + 1}. ${item.name} — ${mnt(item.price)} × ${item.qty} = ${mnt(item.price * item.qty)}`,
	);
	return [
		"🛒 Таны сагс:",
		...items,
		"",
		`Нийт: ${mnt(cartSubtotal(lines))} (${lines.reduce((s, l) => s + l.qty, 0)} ширхэг)`,
	].join("\n");
};

// ─── Payloads ────────────────────────────────────────────────────────────────

const ORDER_PAYLOAD_RE = /^order_product:(\d+)$/;
export const parseOrderPayload = (payload: string): number | undefined => {
	const match = ORDER_PAYLOAD_RE.exec(payload);
	if (!match) {
		return undefined;
	}
	const id = Number(match[1]);
	return Number.isSafeInteger(id) ? id : undefined;
};

const ORDER_CONFIRM_RE = /^order_confirm:(\d+)$/;
export const parseOrderConfirmPayload = (payload: string): number | undefined => {
	const match = ORDER_CONFIRM_RE.exec(payload);
	if (!match) {
		return undefined;
	}
	const rev = Number(match[1]);
	return Number.isSafeInteger(rev) ? rev : undefined;
};

const PAY_TRANSFER_RE = /^pay_transfer:(\S+)$/;
export const parsePayTransferPayload = (payload: string): string | undefined =>
	PAY_TRANSFER_RE.exec(payload)?.[1];

const TRANSFER_DONE_RE = /^transfer_done:(\S+)$/;
export const parseTransferDonePayload = (payload: string): string | undefined =>
	TRANSFER_DONE_RE.exec(payload)?.[1];

const DELIVERY_CHANGE_RE = /^delivery_change:(\d+)$/;
export const parseDeliveryChangePayload = (payload: string): number | undefined => {
	const match = DELIVERY_CHANGE_RE.exec(payload);
	if (!match) {
		return undefined;
	}
	const rev = Number(match[1]);
	return Number.isSafeInteger(rev) ? rev : undefined;
};

// ─── Cart commands ───────────────────────────────────────────────────────────

const ID_RE = /^(\d+)$/;
const parseIdSuffix = (payload: string, prefix: string): number | undefined => {
	if (!payload.startsWith(`${prefix}:`)) {
		return undefined;
	}
	const match = ID_RE.exec(payload.slice(prefix.length + 1));
	if (!match) {
		return undefined;
	}
	const id = Number(match[1]);
	return Number.isSafeInteger(id) ? id : undefined;
};

export const cartCommandSchema = v.variant("kind", [
	v.object({ kind: v.literal("view") }),
	v.object({ kind: v.literal("confirm") }),
	v.object({ kind: v.literal("clear") }),
	v.object({ kind: v.literal("inc"), productId: v.number() }),
	v.object({ kind: v.literal("dec"), productId: v.number() }),
	v.object({ kind: v.literal("remove"), productId: v.number() }),
]);
export type CartCommand = v.InferOutput<typeof cartCommandSchema>;

export const parseCartPayload = (payload: string): CartCommand | undefined => {
	if (payload === "cart_view") {
		return { kind: "view" };
	}
	if (payload === "cart_confirm") {
		return { kind: "confirm" };
	}
	if (payload === "cart_clear") {
		return { kind: "clear" };
	}
	const inc = parseIdSuffix(payload, "cart_inc");
	if (inc !== undefined) {
		return { kind: "inc", productId: inc };
	}
	const dec = parseIdSuffix(payload, "cart_dec");
	if (dec !== undefined) {
		return { kind: "dec", productId: dec };
	}
	const remove = parseIdSuffix(payload, "cart_remove");
	if (remove !== undefined) {
		return { kind: "remove", productId: remove };
	}
	return undefined;
};

// ─── Quick replies (Zernio caps at 13, title <= 20 chars) ────────────────────

const qr = (title: string, payload: string) => ({
	payload,
	title: title.length <= 20 ? title : `${title.slice(0, 19).trimEnd()}…`,
});

export const cartQuickReplies = (
	lines: Array<CartLine>,
): Array<{ payload: string; title: string }> => {
	if (lines.length === 0) {
		return [];
	}
	const global = [qr("✅ Баталгаажуулах", "cart_confirm"), qr("🗑 Сагс хоослох", "cart_clear")];
	const perItem: Array<{ payload: string; title: string }> = [];
	for (const line of lines) {
		if (perItem.length + 3 > 11) {
			break;
		}
		perItem.push(
			qr(`➕ ${line.name}`, `cart_inc:${line.productId}`),
			qr(`➖ ${line.name}`, `cart_dec:${line.productId}`),
			qr(`✖ ${line.name}`, `cart_remove:${line.productId}`),
		);
	}
	return [...global, ...perItem];
};

// ─── Phone / address ─────────────────────────────────────────────────────────

// Mongolian mobile: 8 digits starting 6-9. Normalize spaces/dashes/+976/leading 0.
export const normalizePhone = (raw: string): string => {
	let digits = raw.replaceAll(/\D/g, "");
	if (digits.length === 11 && digits.startsWith("976")) {
		digits = digits.slice(3);
	}
	if (digits.length === 9 && digits.startsWith("0")) {
		digits = digits.slice(1);
	}
	return digits;
};

export const PHONE_RE = /^[6-9]\d{7}$/;

// Phones written inside free text ("85646862 bzd 3 horoo", "+976 8564-6862").
export const phonesInText = (text: string): Array<string> =>
	[...text.matchAll(/(?<!\d)(?:\+?976[\s-]?)?([6-9]\d{3})[\s-]?(\d{4})(?!\d)/g)].map(
		(m) => `${m[1]}${m[2]}`,
	);

// Recognises a free-text transfer claim ("хийсэн" / "hiisen"). Only meaningful
// while a pending payment exists; the caller gates on that.
export const isTransferDoneText = (text: string | undefined): boolean => {
	if (!text) {
		return false;
	}
	const normalized = text.trim().toLowerCase();
	return (
		normalized.length > 0 &&
		(normalized.includes("хийсэн") ||
			normalized.includes("hiisen") ||
			normalized.includes("шилжүүлсэн") ||
			normalized.includes("shiljuulsen"))
	);
};

// The QPay-only page authorises with paymentNumber (path) + checkoutToken (ct).
export const buildQpayPageUrl = (
	storeBaseUrl: string,
	ref: { checkoutToken: string | null; paymentNumber: string },
): string => {
	const base = storeBaseUrl.replace(/\/+$/, "");
	const url = `${base}/payment/qpay/${encodeURIComponent(ref.paymentNumber)}`;
	return ref.checkoutToken ? `${url}?ct=${encodeURIComponent(ref.checkoutToken)}` : url;
};
