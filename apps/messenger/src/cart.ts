// Customer cart types, postback payload parsers, phone/address/confirm matchers.

export type CartLine = { name: string; price: number; productId: number; qty: number };

// The catalogue lists some products twice under different ids and prices
// ("D3 + K2" 110k and "D3 & K2" 135k): the names differ only in punctuation.
export const listingKey = (name: string): string =>
	name.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "");

// ─── Payloads ────────────────────────────────────────────────────────────────

const parseNumericSuffix = (payload: string, re: RegExp): number | undefined => {
	const match = re.exec(payload);
	if (!match) {
		return undefined;
	}
	const value = Number(match[1]);
	return Number.isSafeInteger(value) ? value : undefined;
};

const ORDER_PAYLOAD_RE = /^order_product:(\d+)$/;
export const parseOrderPayload = (payload: string): number | undefined =>
	parseNumericSuffix(payload, ORDER_PAYLOAD_RE);

const ORDER_CONFIRM_RE = /^order_confirm:(\d+)$/;
export const parseOrderConfirmPayload = (payload: string): number | undefined =>
	parseNumericSuffix(payload, ORDER_CONFIRM_RE);

const ORDER_EDIT_RE = /^order_edit:(\d+)$/;
export const parseOrderEditPayload = (payload: string): number | undefined =>
	parseNumericSuffix(payload, ORDER_EDIT_RE);

const DELIVERY_CHANGE_RE = /^delivery_change:(\d+)$/;
export const parseDeliveryChangePayload = (payload: string): number | undefined =>
	parseNumericSuffix(payload, DELIVERY_CHANGE_RE);

export const isCartClearPayload = (payload: string): boolean => payload === "cart_clear";

const TRANSFER_DONE_RE = /^transfer_done:(\S+)$/;
export const parseTransferDonePayload = (payload: string): string | undefined =>
	TRANSFER_DONE_RE.exec(payload)?.[1];

// Welcome-screen ice-breaker buttons, set on the page through Zernio.
const ICE_PAYLOADS = ["ice:order", "ice:price", "ice:delivery"] as const;
export type IcePayload = (typeof ICE_PAYLOADS)[number];
export const parseIcePayload = (payload: string): IcePayload | undefined =>
	ICE_PAYLOADS.find((p) => p === payload);

// ─── Phone, countryside & affirmative confirm ───────────────────────────────

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

// Deterministic countryside safety net when the model forgets countryside: true.
const COUNTRYSIDE_RE =
	/(?:аймаг|дархан|эрдэнэт|орон нутаг|хөдөө|замын унаа|драгон|автобус|хот хоорондын|aimag|darhan|darkhan|erdenet|oron nutag|huduu|hodoo|dragon|\bсум\b|\bsum\b)/iu;

export const isCountrysideAddress = (address: string): boolean => COUNTRYSIDE_RE.test(address);

// Catches bare UB district/complex names ("hunnu 2222", "Олимп хотхон", "БЗД 8-р хороо")
// that lack a building/apartment/street number so we ask for байр, тоот before auto-ordering.
const STRIP_COMPLEX_NUMBERS_RE =
	/(?:(?:хүннү|hunnu)\s*2222|(?<!\d)\d{1,2}\s*-?\s*(?:р|r)?\s*(?:хороолол|хороо|horoolol|horoo)(?![\p{L}\p{N}]))/giu;
const ADDRESS_DETAIL_RE =
	/(?:байр|тоот|орц|давхар|гудамж|хашаа|тоотын|bair|toot|orts|davhar|gudamj|hashaa|apt|door|block|блок|дэлгүүр|delguur|маркет|market|оффис|office|тауэр|tower|төв|tuv|буудал|buudal|эмнэлэг|emneleg|сургууль|surguuli|цэцэрлэг|tsetserleg|үлдээ|uldee|залга|zalga|байр\s*тоот\s*байхгүй|bair\s*toot\s*baihgui|\d)/iu;

export const isIncompleteUbAddress = (address: string, note?: string): boolean => {
	if (isCountrysideAddress(address)) {
		return false;
	}
	const combined = note ? `${address} ${note}` : address;
	const stripped = combined.replaceAll(STRIP_COMPLEX_NUMBERS_RE, " ").trim();
	return !ADDRESS_DETAIL_RE.test(stripped);
};

// Code-only affirmative confirmation matcher (used only when the bot just sent
// a confirm summary for the current revision and no attachments are present).
const AFFIRMATIVE_RE =
	/^(?:(?:за|za)\s+)?(?:за|za|тийм|тийм\s*ээ|tiim|tiimee|ок|ok|болно|bolno|авъя|авья|avya|авна|avna|зөв|zuv|захиал(?:ъя|ья|на|ах)?|zahial(?:ya|na|ah)?|явуулаарай|👍+|\[стикер\])$/u;

export const isAffirmativeConfirm = (text: string): boolean => {
	const trimmed = text.trim();
	if (trimmed.length === 0 || trimmed.length > 20) {
		return false;
	}
	const cleaned = trimmed
		.toLowerCase()
		.replace(/[.!?,~😊🙏]+$/u, "")
		.trim();
	return cleaned.length > 0 && AFFIRMATIVE_RE.test(cleaned);
};
