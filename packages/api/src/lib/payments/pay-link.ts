import * as v from "valibot";
import { kv } from "~/lib/kv";
import { createSession, setSessionTokenCookie } from "~/lib/session/store";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";
import type { HonoContextType } from "~/lib/types";
import { customerQueries, paymentQueries } from "~/queries";

/**
 * Short `/pay/<code>` links for texts. A payment page URL with `?ct=` is too
 * long for an SMS, and the text opens in Safari or Messages where the
 * checkout cookie from Facebook's webview is missing.
 *
 * The code is a bearer token for one order. Redeeming it sets the same
 * checkout-guest session `addOrder` sets, scoped to that order and its
 * payment. For 48 hours an unpaid order opens its payment page. Otherwise,
 * once paid, cancelled or late, the code opens that order's status page.
 */
const PAY_LINK_TTL_SECONDS = 60 * 60 * 24 * 30;
const PAY_LINK_PAYABLE_MS = 48 * 3_600_000;
const CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_LENGTH = 10;
const CODE_RE = /^[0-9A-Za-z]{10}$/;

// Codes issued before issuedAt existed read as 0, so they open the status page.
const payLinkRecordSchema = v.object({
	issuedAt: v.optional(v.number(), 0),
	paymentNumber: v.string(),
});

const payLinkKey = (code: string) => `pay_link:${code}`;

type PaymentInfo = NonNullable<
	Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
>;

export const isAwaitingPayment = (payment: PaymentInfo) =>
	payment.status === "pending" && payment.order.status !== "cancelled";

// 10 base62 characters is about 59 bits. Bytes of 248 and up are dropped so
// every character is equally likely.
function randomCode() {
	let code = "";
	while (code.length < CODE_LENGTH) {
		for (const byte of crypto.getRandomValues(new Uint8Array(CODE_LENGTH))) {
			if (byte < 248 && code.length < CODE_LENGTH) {
				code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
			}
		}
	}
	return code;
}

export async function createPayLink(paymentNumber: string) {
	const code = randomCode();
	await kv().put(payLinkKey(code), JSON.stringify({ issuedAt: Date.now(), paymentNumber }), {
		expirationTtl: PAY_LINK_TTL_SECONDS,
	});
	return code;
}

async function readPayLink(code: string) {
	if (!CODE_RE.test(code)) {
		return null;
	}
	const raw = await kv().get(payLinkKey(code));
	if (!raw) {
		return null;
	}
	try {
		const parsed = v.safeParse(payLinkRecordSchema, JSON.parse(raw));
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
}

/**
 * Sets a checkout-guest session for the code's order and returns where to send
 * the buyer, or null when the code or its order is unknown.
 */
export async function redeemPayLink(c: HonoContextType, code: string) {
	const record = await readPayLink(code);
	if (!record) {
		return null;
	}
	const payment = await paymentQueries.store.getPaymentInfoByNumber(record.paymentNumber);
	if (!payment) {
		return null;
	}
	const customer = await customerQueries.store.getCustomerByPhone(payment.order.customerPhone);
	if (!customer) {
		return null;
	}
	const checkoutGuestUser = {
		...customer,
		checkout: {
			orderId: payment.order.id,
			orderNumber: payment.order.orderNumber,
			paymentNumber: payment.paymentNumber,
		},
		trust: "checkout_guest" as const,
	} satisfies CustomerSessionClaims;
	const { session, token } = await createSession(checkoutGuestUser, kv());
	setSessionTokenCookie(c, token, session.expiresAt);
	const payable = isAwaitingPayment(payment) && Date.now() - record.issuedAt < PAY_LINK_PAYABLE_MS;
	return {
		path: payable
			? `/payment/${payment.paymentNumber}`
			: `/order-tracking?order=${encodeURIComponent(payment.order.orderNumber)}`,
		paymentNumber: payment.paymentNumber,
	};
}
