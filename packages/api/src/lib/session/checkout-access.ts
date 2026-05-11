import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { TRPCError } from "@trpc/server";
import type { Context, CustomerSelectType } from "~/lib/context";
import { paymentQueries } from "~/queries/payments";
import { orderQueries } from "~/queries/orders";

export type CustomerSessionTrust = "checkout_guest" | "phone_verified";

export type CheckoutScope = {
	orderId: number;
	orderNumber: string;
	paymentNumber: string;
};

export type CustomerSessionClaims = CustomerSelectType & {
	trust?: CustomerSessionTrust;
	checkout?: CheckoutScope;
};

export type CheckoutAccessTokenRecord = CheckoutScope & {
	phone: number;
	tokenHash: string;
};

const CHECKOUT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const hashToken = (token: string): string =>
	encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

const createRawToken = (): string => {
	const first = crypto.randomUUID();
	const second = crypto.randomUUID();
	return `${first}.${second}`;
};

const tokenKey = (paymentNumber: string) => `checkout:payment:${paymentNumber}`;

export async function createCheckoutAccessToken(
	ctx: Pick<Context, "kv">,
	record: Omit<CheckoutAccessTokenRecord, "tokenHash">,
): Promise<string> {
	const token = createRawToken();
	await ctx.kv.put(
		tokenKey(record.paymentNumber),
		JSON.stringify({ ...record, tokenHash: hashToken(token) }),
		{ expirationTtl: CHECKOUT_TOKEN_TTL_SECONDS },
	);
	return token;
}

async function validateCheckoutToken(
	ctx: Pick<Context, "kv">,
	paymentNumber: string,
	checkoutToken: string | undefined,
): Promise<CheckoutAccessTokenRecord | null> {
	if (!checkoutToken) return null;
	const raw = await ctx.kv.get(tokenKey(paymentNumber));
	if (!raw) return null;
	const record = JSON.parse(raw) as CheckoutAccessTokenRecord;
	return record.tokenHash === hashToken(checkoutToken) ? record : null;
}

function getCustomerClaims(ctx: Context): CustomerSessionClaims | null {
	const user = ctx.session?.user;
	if (!user || !("phone" in user)) return null;
	return user as CustomerSessionClaims;
}

export function isPhoneVerifiedCustomer(ctx: Context): boolean {
	return getCustomerClaims(ctx)?.trust === "phone_verified";
}

export async function assertCanAccessPayment(
	ctx: Context,
	paymentNumber: string,
	checkoutToken?: string,
) {
	const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
	}

	const claims = getCustomerClaims(ctx);
	if (
		claims?.trust === "phone_verified" &&
		claims.phone === payment.order.customerPhone
	) {
		return payment;
	}

	if (
		claims?.trust === "checkout_guest" &&
		claims.checkout?.paymentNumber === paymentNumber
	) {
		return payment;
	}

	const tokenRecord = await validateCheckoutToken(ctx, paymentNumber, checkoutToken);
	if (tokenRecord?.phone === payment.order.customerPhone) {
		return payment;
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "You are not authorized to access this payment",
	});
}

export async function assertCanAccessOrder(
	ctx: Context,
	orderNumber: string,
	checkoutToken?: string,
) {
	const order = await orderQueries.store.getOrderByOrderNumber(orderNumber);
	if (!order) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Захиалга олдсонгүй" });
	}

	const paymentNumber = order.payments[0]?.paymentNumber;
	const claims = getCustomerClaims(ctx);
	if (claims?.trust === "phone_verified" && claims.phone === order.customerPhone) {
		return order;
	}

	if (
		claims?.trust === "checkout_guest" &&
		claims.checkout?.orderNumber === orderNumber
	) {
		return order;
	}

	if (paymentNumber) {
		const tokenRecord = await validateCheckoutToken(ctx, paymentNumber, checkoutToken);
		if (tokenRecord?.phone === order.customerPhone) return order;
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: "Захиалгын мэдээлэл харах эрхгүй",
	});
}
