import { env } from "cloudflare:workers";
import type { QpayInvoice } from "@vit/shared";
import { Result, type Result as ResultType } from "better-result";
import ky, { HTTPError } from "ky";
import * as v from "valibot";
import { logger } from "~/lib/logger";

const apiUrl = env.QPAY_URL.endsWith("/") ? env.QPAY_URL : `${env.QPAY_URL}/`;
const requestStartedAt = new WeakMap<Request, number>();

const tokenResponseSchema = v.object({
	access_token: v.string(),
	expires_in: v.number(),
});

const paymentUrlSchema = v.object({
	name: v.string(),
	description: v.string(),
	logo: v.string(),
	link: v.string(),
});

const invoiceResponseSchema = v.object({
	invoice_id: v.string(),
	qr_text: v.string(),
	qr_image: v.string(),
	qPay_shortUrl: v.string(),
	urls: v.array(paymentUrlSchema),
});

const paymentResponseSchema = v.object({
	count: v.number(),
	paid_amount: v.number(),
	rows: v.array(v.object({ payment_status: v.string() })),
});

export type QpayProviderError =
	| { _tag: "QpayRejected"; status: number; retryable: boolean }
	| { _tag: "QpayAmbiguous"; retryable: false }
	| { _tag: "QpayMalformedResponse"; retryable: false }
	| { _tag: "QpayConfigurationError"; retryable: false };

const qpayError = (
	error: unknown,
	operation: "create" | "check",
): QpayProviderError => {
	if (error instanceof v.ValiError || error instanceof SyntaxError) {
		return { _tag: "QpayMalformedResponse", retryable: false };
	}
	if (error instanceof HTTPError) {
		const status = error.response.status;
		if (
			operation === "create" &&
			(status === 408 || status === 409 || status === 429 || status >= 500)
		) {
			return { _tag: "QpayAmbiguous", retryable: false };
		}
		return {
			_tag: "QpayRejected",
			status,
			retryable: operation === "check" && (status === 429 || status >= 500),
		};
	}
	if (error instanceof Error && error.name === "QpayConfigurationError") {
		return { _tag: "QpayConfigurationError", retryable: false };
	}
	return operation === "create"
		? { _tag: "QpayAmbiguous", retryable: false }
		: { _tag: "QpayRejected", status: 0, retryable: true };
};

const QPAY_ACCESS_TOKEN_KEY = "qpay_access_token";

const getCallbackUrl = (paymentNumber: string) => {
	try {
		const callbackUrl = new URL(
			env.QPAY_CALLBACK_URL ??
				`${new URL(env.GOOGLE_CALLBACK_URL).origin}/webhooks/qpay`,
		);
		callbackUrl.searchParams.set("id", paymentNumber);
		return callbackUrl;
	} catch {
		const error = new Error("QPay callback configuration is unavailable.");
		error.name = "QpayConfigurationError";
		throw error;
	}
};

const resolveTokenTtlFromUnixSeconds = (expiresAtUnixSeconds: number) => {
	const now = Math.floor(Date.now() / 1000);
	const ttl = expiresAtUnixSeconds - now;
	return Math.max(ttl - 60, 60);
};

const getAccessToken = async (opts?: { forceRefresh?: boolean }) => {
	if (!opts?.forceRefresh) {
		const tokenFromKv = await env.vitStoreKV.get(QPAY_ACCESS_TOKEN_KEY);
		if (tokenFromKv) return tokenFromKv;
	}

	const username = env.QPAY_USERNAME?.trim();
	const password = env.QPAY_PASSWORD?.trim();
	if (!username || !password) {
		const error = new Error("QPay configuration is unavailable.");
		error.name = "QpayConfigurationError";
		throw error;
	}

	const response = await ky
		.post(`${apiUrl}auth/token`, {
			headers: {
				Authorization: `Basic ${btoa(`${username}:${password}`)}`,
				"Content-Type": "application/json",
			},
		})
		.json<unknown>();
	const auth = v.parse(tokenResponseSchema, response);
	const expirationTtl = resolveTokenTtlFromUnixSeconds(auth.expires_in);
	await env.vitStoreKV.put(QPAY_ACCESS_TOKEN_KEY, auth.access_token, {
		expirationTtl,
	});
	return auth.access_token;
};

const qpayClient = ky.create({
	prefixUrl: apiUrl,
	hooks: {
		beforeRequest: [
			async (request) => {
				requestStartedAt.set(request, Date.now());
				const token = await getAccessToken();
				request.headers.set("Authorization", `Bearer ${token}`);
			},
		],
		afterResponse: [
			async (request, options, response) => {
				logger.info("qpay.response", {
					method: request.method,
					status: response.status,
					durationMs:
						Date.now() - (requestStartedAt.get(request) ?? Date.now()),
				});
				if (
					response.status !== 401 ||
					request.headers.get("x-qpay-retried") === "1"
				) {
					return response;
				}
				await env.vitStoreKV.delete(QPAY_ACCESS_TOKEN_KEY);
				const refreshedToken = await getAccessToken({ forceRefresh: true });
				const retryRequest = new Request(request);
				retryRequest.headers.set("Authorization", `Bearer ${refreshedToken}`);
				retryRequest.headers.set("x-qpay-retried", "1");
				return await ky(retryRequest, options);
			},
		],
		beforeError: [
			(error) => {
				logger.error("qpay.request_failed", {
					method: error.request.method,
					status: error.response.status,
				});
				return error;
			},
		],
	},
});

export const createQpayInvoice = async (
	amount: number,
	paymentNumber: string,
): Promise<ResultType<QpayInvoice, QpayProviderError>> =>
	Result.tryPromise({
		try: async () => {
			const callbackUrl = getCallbackUrl(paymentNumber);
			const value = await qpayClient
				.post("invoice", {
					json: {
						invoice_code: "AMERIK_VITAMIN_INVOICE",
						sender_invoice_no: paymentNumber,
						invoice_receiver_code: "terminal",
						invoice_description: paymentNumber,
						sender_branch_code: "SALBAR1",
						amount,
						callback_url: callbackUrl.toString(),
					},
				})
				.json<unknown>();
			return v.parse(invoiceResponseSchema, value) satisfies QpayInvoice;
		},
		catch: (error) => qpayError(error, "create"),
	});

export const checkQpayInvoice = async (
	invoiceId: string,
): Promise<ResultType<boolean, QpayProviderError>> =>
	Result.tryPromise({
		try: async () => {
			const value = await qpayClient
				.post("payment/check", {
					json: {
						object_type: "INVOICE",
						object_id: invoiceId,
						offset: { page_number: 1, page_limit: 100 },
					},
				})
				.json<unknown>();
			const response = v.parse(paymentResponseSchema, value);
			return response.rows[0]?.payment_status === "PAID";
		},
		catch: (error) => qpayError(error, "check"),
	});
