import { deliveryFee } from "@vit/shared/constants";
import * as v from "valibot";
import { type Cart, cartItemCount, cartSubtotal, isCartEmpty } from "./cart";

// Channel-neutral checkout domain for the customer assistant (ADR 0002/0007).
// A small, pure state machine that turns a CONFIRMED cart (#21) into the inputs
// the existing `order.addOrder` API needs: validated phone, natural address,
// a CONFIRMED delivery zone (ADR 0005 — confirm the top candidate, never auto-
// pick), and optional notes. All transitions are pure functions over an
// immutable `CheckoutState`; the agent app owns persistence (a Durable Object,
// ADR 0006), the channel wiring, and the order/zone HTTP boundary.
//
// Crucially this module NEVER computes the order total. The order total
// (products + the 6,000 MNT delivery fee) is owned by `order.addOrder`; the
// summary here shows a customer-facing ESTIMATE from the cart's price snapshot
// plus `deliveryFee`, clearly labelled, so the bot and the site never disagree
// on what the API will actually charge.

// The ordered phases a checkout walks through. Phone is collected FIRST and
// only here (never earlier in the pre-order conversation, per the spec), then
// address, then zone confirmation, then optional notes, then a final summary
// the customer confirms before the order is created.
export const checkoutPhaseSchema = v.picklist([
	"collecting_phone",
	"collecting_address",
	"confirming_zone",
	"collecting_notes",
	"confirming",
	"creating",
	"created",
]);

export type CheckoutPhase = v.InferOutput<typeof checkoutPhaseSchema>;

// A delivery-zone candidate surfaced for the customer to confirm. `score` and
// `evidence` come from the best-effort ranker (delivery-zones.ts) and are kept
// so the confirmation prompt and any debugging can explain why a zone was
// suggested.
export const zoneCandidateSchema = v.object({
	evidence: v.array(v.string()),
	score: v.number(),
	zoneId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	zoneName: v.string(),
});

export type ZoneCandidate = v.InferOutput<typeof zoneCandidateSchema>;

// Post-order payment surface state (#25). Once the order exists, the checkout
// record also tracks where the customer is in the Messenger payment flow so the
// deterministic webhook path can recognise a bank-transfer claim by free text
// ("хийсэн") or a screenshot, not only by the explicit button. `offered` = the
// QPay/transfer choice was sent; `transfer_pending` = the customer picked bank
// transfer and saw the account; `transfer_claimed` = they reported paying. NONE
// of these is a confirmed payment — that is owned by admin/bank tooling (ADR
// 0004), and the checkout layer never advances the payment to success.
export const transferStatusSchema = v.picklist(["offered", "transfer_pending", "transfer_claimed"]);

export type TransferStatus = v.InferOutput<typeof transferStatusSchema>;

export const paymentContextSchema = v.object({
	checkoutToken: v.optional(v.string()),
	paymentNumber: v.string(),
	transferStatus: transferStatusSchema,
});

export type PaymentContext = v.InferOutput<typeof paymentContextSchema>;

// The whole checkout's collected state. Persisted verbatim by the per-session
// CheckoutStore DO, so it is a plain valibot-validatable record.
export const checkoutStateSchema = v.object({
	address: v.optional(v.string()),
	candidates: v.array(zoneCandidateSchema),
	notes: v.optional(v.string()),
	payment: v.optional(paymentContextSchema),
	phase: checkoutPhaseSchema,
	phone: v.optional(v.string()),
	selectedZoneId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	selectedZoneName: v.optional(v.string()),
});

export type CheckoutState = v.InferOutput<typeof checkoutStateSchema>;

export const initialCheckoutState = (): CheckoutState => ({
	candidates: [],
	phase: "collecting_phone",
});

// The exact input shape `order.addOrder` accepts (mirrors `newOrderSchema` in
// @vit/shared). Kept structural here so the channel-neutral domain does not
// import the api/db type graph; the agent boundary validates the wire response.
export interface CheckoutOrderPayload {
	address: string;
	addressZoneId: number;
	notes?: string;
	phoneNumber: string;
	products: Array<{ productId: number; quantity: number }>;
}

// ── Phone validation ─────────────────────────────────────────────────────────
//
// Mongolian mobile numbers are 8 digits starting 6–9 (same rule the storefront
// `newOrderSchema.phoneNumber` enforces). We normalize common chat variants —
// spaces/dashes, a 976 country code, a stray leading 0 — before validating so a
// customer typing "9911-2233" or "+976 99112233" is accepted.
const PHONE_RE = /^[6-9]\d{7}$/;

export const PHONE_INVALID_MESSAGE =
	"Утасны дугаар буруу байна. 8 оронтой, 6-9-өөр эхэлсэн дугаараа бичнэ үү (ж: 99112233).";

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

export type PhoneValidation = { ok: true; phone: string } | { error: string; ok: false };

export const validatePhone = (raw: string): PhoneValidation => {
	const phone = normalizePhone(raw);
	return PHONE_RE.test(phone) ? { ok: true, phone } : { error: PHONE_INVALID_MESSAGE, ok: false };
};

// ── Transitions (pure) ───────────────────────────────────────────────────────

// Guards that a checkout may begin: the cart must be the explicitly confirmed,
// non-empty cart (#21's checkout gate). Returns the reason when it may not, so
// the tool can tell the customer to confirm their cart first.
export const CHECKOUT_NEEDS_CONFIRMED_CART_MESSAGE =
	"Захиалга эхлүүлэхийн өмнө сагсаа баталгаажуулна уу.";

export const canBeginCheckout = (cart: Cart): { ok: true } | { error: string; ok: false } => {
	if (isCartEmpty(cart) || !cart.confirmed) {
		return { error: CHECKOUT_NEEDS_CONFIRMED_CART_MESSAGE, ok: false };
	}
	return { ok: true };
};

// Records a validated phone and advances to address collection. Returns the
// validation error untouched when the phone is invalid (caller re-prompts).
export const applyPhone = (
	state: CheckoutState,
	raw: string,
): { ok: true; state: CheckoutState } | { error: string; ok: false } => {
	const result = validatePhone(raw);
	if (!result.ok) {
		return result;
	}
	return {
		ok: true,
		state: {
			...state,
			phase: "collecting_address",
			phone: result.phone,
		},
	};
};

// Records the natural-language address and advances to zone confirmation. The
// candidates are attached separately (the channel resolves them over HTTP).
export const applyAddress = (
	state: CheckoutState,
	text: string,
): { ok: true; state: CheckoutState } | { error: string; ok: false } => {
	const address = text.trim();
	if (address.length === 0) {
		return {
			error: "Хүргэлтийн хаягаа бичнэ үү (дүүрэг, хороо, байр/тоот).",
			ok: false,
		};
	}
	return {
		ok: true,
		state: { ...state, address, candidates: [], phase: "confirming_zone" },
	};
};

export const setZoneCandidates = (
	state: CheckoutState,
	candidates: Array<ZoneCandidate>,
): CheckoutState => ({ ...state, candidates });

export const ZONE_NOT_A_CANDIDATE_MESSAGE =
	"Тэр бүсийг сонгох боломжгүй байна. Доорх жагсаалтаас сонгоно уу.";

// Confirms one of the surfaced candidates (ADR 0005: the customer picks; the
// bot never silently auto-selects). Rejects a zoneId that was not offered so a
// model hallucinating a zone id cannot leak into the order.
export const applyZoneSelection = (
	state: CheckoutState,
	zoneId: number,
): { ok: true; state: CheckoutState } | { error: string; ok: false } => {
	const candidate = state.candidates.find((c) => c.zoneId === zoneId);
	if (!candidate) {
		return { error: ZONE_NOT_A_CANDIDATE_MESSAGE, ok: false };
	}
	return {
		ok: true,
		state: {
			...state,
			phase: "collecting_notes",
			selectedZoneId: candidate.zoneId,
			selectedZoneName: candidate.zoneName,
		},
	};
};

// Records optional notes (empty/skip → no notes) and advances to the final
// confirmation summary.
export const applyNotes = (state: CheckoutState, notes: string | undefined): CheckoutState => {
	const trimmed = notes?.trim();
	const next: CheckoutState = { ...state, phase: "confirming" };
	if (trimmed) {
		next.notes = trimmed;
	}
	return next;
};

// Claims the irreversible order-creation step BEFORE `createOrder` runs. The
// claim is persisted first so any in-turn/durable replay after `createOrder`
// but before `created` is committed observes `creating` and refuses to mint a
// second order (order creation has no idempotency key). Non-retryable: a stuck
// `creating` is the safe failure mode versus a duplicate order.
export const markCreating = (state: CheckoutState): CheckoutState => ({
	...state,
	phase: "creating",
});

export const markCreated = (state: CheckoutState): CheckoutState => ({
	...state,
	phase: "created",
});

// Records the order's payment identifiers on the created checkout so the
// post-order Messenger payment surface (#25) can build the QPay link and, later,
// recognise a bank-transfer claim for this exact payment. Starts at `offered`.
export const attachPayment = (
	state: CheckoutState,
	input: { checkoutToken: string | null; paymentNumber: string },
): CheckoutState => {
	const payment: PaymentContext = {
		paymentNumber: input.paymentNumber,
		transferStatus: "offered",
	};
	if (input.checkoutToken) {
		payment.checkoutToken = input.checkoutToken;
	}
	return { ...state, payment };
};

// Advances the bank-transfer status WITHOUT ever touching payment confirmation:
// the checkout layer only records that the customer entered the transfer flow
// (`transfer_pending`) or reported paying (`transfer_claimed`). Real payment
// confirmation stays with admin/bank tooling (ADR 0004). No-op when no payment
// context exists.
export const setTransferStatus = (
	state: CheckoutState,
	transferStatus: TransferStatus,
): CheckoutState =>
	state.payment ? { ...state, payment: { ...state.payment, transferStatus } } : state;

// Whether every field the order API requires is present. Used as the guard
// before building the payload / creating the order.
export const isReadyToCreate = (state: CheckoutState): boolean =>
	state.phone !== undefined &&
	state.address !== undefined &&
	state.address.length > 0 &&
	state.selectedZoneId !== undefined;

// Builds the exact `order.addOrder` input from the checkout state and the
// CONFIRMED cart snapshot. Line quantities come straight from the cart; prices
// are NOT sent — the API recomputes the authoritative total from its own
// catalog and adds the delivery fee. Throws if called before `isReadyToCreate`.
export const buildCheckoutOrderPayload = (
	state: CheckoutState,
	cart: Cart,
): CheckoutOrderPayload => {
	if (!isReadyToCreate(state)) {
		throw new Error("checkout is not ready: missing phone, address, or zone");
	}
	const phone = state.phone;
	const address = state.address;
	const addressZoneId = state.selectedZoneId;
	if (!phone || !address || addressZoneId === undefined) {
		throw new Error("checkout is not ready: missing phone, address, or zone");
	}
	const payload: CheckoutOrderPayload = {
		address,
		addressZoneId,
		phoneNumber: phone,
		products: cart.items.map((item) => ({
			productId: item.productId,
			quantity: item.quantity,
		})),
	};
	if (state.notes) {
		payload.notes = state.notes;
	}
	return payload;
};

// ── Formatting (Mongolian, channel-neutral text) ─────────────────────────────

const formatPrice = (price: number): string => `${Math.round(price).toLocaleString("en-US")}₮`;

export const CHECKOUT_PHONE_PROMPT =
	"За 🙏 Захиалгаа авъя. Утасны дугаар, хүргэлтийн хаягаа (дүүрэг, хороо, байр/тоот) бичээд илгээгээрэй.";

export const CHECKOUT_ADDRESS_PROMPT = "За. Хүргэлтийн хаягаа бичээрэй (дүүрэг, хороо, байр/тоот).";

export const CHECKOUT_NOTES_PROMPT =
	"Захиалгад нэмэлт тэмдэглэл байвал бичнэ үү, эсвэл «алга» гэж бичээд алгасаарай.";

// Renders the ranked candidates as a numbered list the customer confirms one
// of. Never auto-picks: even a single strong candidate is shown for an explicit
// yes (ADR 0005).
export const formatZoneCandidates = (candidates: Array<ZoneCandidate>): string => {
	if (candidates.length === 0) {
		return "Уучлаарай, таны хаягт тохирох хүргэлтийн бүс олдсонгүй. Хаягаа дэлгэрэнгүй бичиж үзнэ үү.";
	}
	const lines = candidates.map((c, index) => `${index + 1}. ${c.zoneName}`);
	return [
		"Таны хаягт тохирох хүргэлтийн бүс(үүд):",
		...lines,
		"",
		"Аль нь зөв болохыг дугаараар нь сонгоно уу.",
	].join("\n");
};

// The final pre-creation summary. Shows line items from the snapshot, an
// ESTIMATED total (subtotal + delivery fee) labelled as such, and the collected
// phone/address/zone/notes so the customer can confirm before the order is
// created. The API computes the binding total.
export const formatOrderSummary = (state: CheckoutState, cart: Cart): string => {
	const lines = cart.items.map((item, index) => {
		const lineTotal = item.price * item.quantity;
		return `${index + 1}. ${item.name} — ${formatPrice(item.price)} × ${item.quantity} = ${formatPrice(lineTotal)}`;
	});
	const subtotal = cartSubtotal(cart);
	const estimatedTotal = subtotal + deliveryFee;
	return [
		"🧾 Захиалгын баталгаажуулалт:",
		...lines,
		"",
		`Барааны дүн: ${formatPrice(subtotal)} (${cartItemCount(cart)} ширхэг)`,
		`Хүргэлт: ${formatPrice(deliveryFee)}`,
		`Нийт (ойролцоогоор): ${formatPrice(estimatedTotal)}`,
		"",
		`📞 Утас: ${state.phone ?? "—"}`,
		`📍 Хаяг: ${state.address ?? "—"}`,
		`🚚 Бүс: ${state.selectedZoneName ?? "—"}`,
		...(state.notes ? [`📝 Тэмдэглэл: ${state.notes}`] : []),
		"",
		"Захиалгаа баталгаажуулахдаа «тийм» гэж бичнэ үү.",
	].join("\n");
};

// Confirmation text after the order is created. Surfaces the order/payment
// numbers the customer (and the later payment slices #24/#25) need.
export const formatOrderCreated = (orderNumber: string, paymentNumber: string | null): string => {
	const lines = ["✅ Захиалга амжилттай үүслээ!", `Захиалгын дугаар: ${orderNumber}`];
	if (paymentNumber) {
		lines.push(`Төлбөрийн дугаар: ${paymentNumber}`);
	}
	lines.push("Төлбөрийн мэдээллийг удахгүй илгээх болно. Баярлалаа!");
	return lines.join("\n");
};
