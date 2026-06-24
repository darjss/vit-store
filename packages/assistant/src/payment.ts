import { bankTransfer } from "@vit/shared/constants";

// Channel-neutral payment-surface domain for the post-order Messenger flow (#25,
// ADR 0004). After an order is created the customer is offered two equal
// choices: QPay (opens the dedicated QPay-only storefront page, #24) and bank
// transfer (account details shown in chat). A transfer "claim" — the customer
// reporting that they paid — is ACKNOWLEDGED but NEVER treated as confirmation:
// it stays pending until admin/bank tooling verifies it. This module owns only
// the pure pieces (button payloads, the QPay url, the Mongolian message copy,
// and the free-text claim matcher); the agent app owns the channel send, the
// store-API boundary, and persistence.

// ── Postback payloads ────────────────────────────────────────────────────────
//
// The two post-order buttons round-trip on the Messenger webhook as postbacks.
// Each payload carries the order's payment identifiers so the deterministic
// webhook path can act without re-reading session state. The prefixes are
// disjoint (neither is a prefix of the other) so detection is unambiguous.

const CHOOSE_TRANSFER_PREFIX = "pay_transfer";
const CLAIM_TRANSFER_PREFIX = "transfer_done";

export interface PaymentRef {
	paymentNumber: string;
	checkoutToken: string | null;
}

const encodeRef = (prefix: string, ref: PaymentRef): string =>
	`${prefix}:${ref.paymentNumber}:${ref.checkoutToken ?? ""}`;

const decodeRef = (prefix: string, payload: string): PaymentRef | undefined => {
	const head = `${prefix}:`;
	if (!payload.startsWith(head)) return undefined;
	const rest = payload.slice(head.length);
	const sep = rest.indexOf(":");
	if (sep < 0) return undefined;
	const paymentNumber = rest.slice(0, sep);
	const checkoutToken = rest.slice(sep + 1);
	if (paymentNumber.length === 0) return undefined;
	return {
		paymentNumber,
		checkoutToken: checkoutToken.length > 0 ? checkoutToken : null,
	};
};

export const chooseTransferPayload = (ref: PaymentRef): string =>
	encodeRef(CHOOSE_TRANSFER_PREFIX, ref);

export const claimTransferPayload = (ref: PaymentRef): string =>
	encodeRef(CLAIM_TRANSFER_PREFIX, ref);

export const parseChooseTransferPayload = (
	payload: string,
): PaymentRef | undefined => decodeRef(CHOOSE_TRANSFER_PREFIX, payload);

export const parseClaimTransferPayload = (
	payload: string,
): PaymentRef | undefined => decodeRef(CLAIM_TRANSFER_PREFIX, payload);

// ── QPay-only page url (#24) ─────────────────────────────────────────────────
//
// The QPay page authorises with the payment number (path) + checkout token
// (`ct` query), exactly as the storefront link does. The token is omitted when
// absent rather than sent empty.
export const buildQpayPageUrl = (
	storeBaseUrl: string,
	ref: PaymentRef,
): string => {
	const base = storeBaseUrl.replace(/\/+$/, "");
	const url = `${base}/payment/qpay/${encodeURIComponent(ref.paymentNumber)}`;
	return ref.checkoutToken
		? `${url}?ct=${encodeURIComponent(ref.checkoutToken)}`
		: url;
};

// ── Payment-choice buttons (sent right after order creation) ─────────────────

export const QPAY_BUTTON_TITLE = "QPay-р төлөх";
export const TRANSFER_BUTTON_TITLE = "Дансаар шилжүүлэх";
export const TRANSFER_DONE_BUTTON_TITLE = "Шилжүүлсэн";

export const PAYMENT_CHOICE_PROMPT =
	"Төлбөрөө хэрхэн төлөх вэ? QPay-р эсвэл дансаар шилжүүлж болно.";

export interface PaymentChoiceButton {
	type: "web_url" | "postback";
	title: string;
	url?: string;
	payload?: string;
}

// The two equal payment choices as a channel-neutral button template body. QPay
// is a url button straight to the QPay-only page; transfer is a postback the
// webhook turns into the in-chat bank details.
export const buildPaymentChoice = (
	storeBaseUrl: string,
	ref: PaymentRef,
): { text: string; buttons: PaymentChoiceButton[] } => ({
	text: PAYMENT_CHOICE_PROMPT,
	buttons: [
		{
			type: "web_url",
			title: QPAY_BUTTON_TITLE,
			url: buildQpayPageUrl(storeBaseUrl, ref),
		},
		{
			type: "postback",
			title: TRANSFER_BUTTON_TITLE,
			payload: chooseTransferPayload(ref),
		},
	],
});

// ── Bank-transfer details (sent when the customer picks transfer) ────────────

const formatMnt = (amount: number): string =>
	`${amount.toLocaleString("en-US")}₮`;

// The in-chat transfer instructions: bank/account/name from the shared single
// source, the order amount, and the transfer reference (the customer's phone —
// what admin/bank reconciliation matches on). Mirrors the storefront transfer
// tab so chat and site never disagree.
export const formatBankTransferDetails = (input: {
	amount: number;
	reference: string;
}): string =>
	[
		"Дансаар шилжүүлэх мэдээлэл:",
		`Банк: ${bankTransfer.bankName}`,
		`Данс: ${bankTransfer.accountNumber}`,
		`Нэр: ${bankTransfer.accountName}`,
		`Дүн: ${formatMnt(input.amount)}`,
		`Гүйлгээний утга: ${input.reference}`,
		"",
		`Гүйлгээний утга хэсэгт заавал ${input.reference} гэж бичнэ үү. Шилжүүлсний дараа "Шилжүүлсэн" товчийг дарна уу.`,
	].join("\n");

// ── Transfer claim acknowledgement (ADR 0004) ────────────────────────────────
//
// What the bot replies when the customer claims they transferred — by button,
// by "хийсэн"/"hiisen" text, or by sending a screenshot. It ACKNOWLEDGES the
// claim and is explicit that the order proceeds only after admin/bank
// confirmation. It never says the payment is confirmed.
export const TRANSFER_CLAIM_ACK_MESSAGE =
	"Таны шилжүүлгийн мэдэгдлийг хүлээн авлаа. Баярлалаа! Төлбөрийг админ/банкны баталгаажуулсны дараа захиалга үргэлжилнэ. Баталгаажмагц бид танд мэдэгдэх болно.";

// Recognises a free-text transfer claim ("хийсэн" / "hiisen" — "I did it").
// Only meaningful inside the post-order transfer context; the caller gates on
// session state before treating a match as a claim.
export const isTransferDoneText = (text: string | undefined): boolean => {
	if (!text) return false;
	const normalized = text.trim().toLowerCase();
	if (normalized.length === 0) return false;
	return (
		normalized.includes("хийсэн") ||
		normalized.includes("hiisen") ||
		normalized.includes("шилжүүлсэн") ||
		normalized.includes("shiljuulsen")
	);
};
