import { env } from "cloudflare:workers";
import ky, { HTTPError } from "ky";
import * as v from "valibot";
import { logger } from "~/lib/logger";

const apiUrl = env.QPAY_URL.endsWith("/") ? env.QPAY_URL : `${env.QPAY_URL}/`;
const requestStartedAt = new WeakMap<Request, number>();

const truncate = (value: string, maxLength = 500) =>
	value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

const tokenResponseSchema = v.object({
	access_token: v.string(),
	expires_in: v.number(),
	"not-before-policy": v.string(),
	refresh_expires_in: v.number(),
	refresh_token: v.string(),
	scope: v.string(),
	session_state: v.string(),
	token_type: v.string(),
});

type TokenResponse = v.InferOutput<typeof tokenResponseSchema>;

const paymentUrlSchema = v.object({
	description: v.string(),
	link: v.string(),
	logo: v.string(),
	name: v.string(),
});

export const invoiceResponseSchema = v.object({
	invoice_id: v.pipe(v.string(), v.minLength(1)),
	qPay_shortUrl: v.string(),
	qr_image: v.string(),
	qr_text: v.string(),
	urls: v.array(paymentUrlSchema),
});

export type InvoiceResponse = v.InferOutput<typeof invoiceResponseSchema>;

export const parseQpayInvoiceResponse = (value: string): InvoiceResponse | null => {
	try {
		return v.parse(invoiceResponseSchema, JSON.parse(value));
	} catch {
		return null;
	}
};

const p2pTransactionSchema = v.object({
	account_bank_code: v.string(),
	account_bank_name: v.string(),
	account_number: v.string(),
	amount: v.string(),
	currency: v.string(),
	id: v.string(),
	settlement_status: v.string(),
	status: v.string(),
	transaction_bank_code: v.string(),
});

const paymentRowSchema = v.object({
	card_transactions: v.array(v.unknown()),
	next_payment_date: v.nullable(v.string()),
	next_payment_datetime: v.nullable(v.string()),
	p2p_transactions: v.array(p2pTransactionSchema),
	payment_amount: v.string(),
	payment_currency: v.string(),
	payment_id: v.string(),
	payment_status: v.string(),
	payment_type: v.string(),
	payment_wallet: v.string(),
	trx_fee: v.string(),
});

const paymentResponseSchema = v.object({
	count: v.number(),
	paid_amount: v.number(),
	rows: v.array(paymentRowSchema),
});

const QPAY_ACCESS_TOKEN_KEY = "qpay_access_token";

const resolveTokenTtlFromUnixSeconds = (expiresAtUnixSeconds: number) => {
	const now = Math.floor(Date.now() / 1000);
	const ttl = expiresAtUnixSeconds - now;
	return Math.max(ttl - 60, 60);
};

const getAccessToken = async (opts?: { forceRefresh?: boolean }) => {
	if (!opts?.forceRefresh) {
		const tokenFromKV = await env.vitStoreKV.get(QPAY_ACCESS_TOKEN_KEY);
		if (tokenFromKV) {
			logger.debug("qpay access token cache hit");
			return tokenFromKV;
		}
		logger.info("qpay access token cache miss");
	}

	const username = env.QPAY_USERNAME?.trim();
	const password = env.QPAY_PASSWORD?.trim();
	if (!username || !password) {
		throw new Error("QPay credentials are missing or empty");
	}

	const credentials = btoa(`${username}:${password}`);

	let authResponse: TokenResponse;
	try {
		logger.info("requesting qpay access token", { baseUrl: apiUrl });
		authResponse = v.parse(
			tokenResponseSchema,
			await ky
				.post(`${apiUrl}auth/token`, {
					headers: {
						Authorization: `Basic ${credentials}`,
						"Content-Type": "application/json",
					},
				})
				.json(),
		);
	} catch (error) {
		if (error instanceof HTTPError) {
			const body = await error.response.text();
			logger.error("qpay auth failed", {
				baseUrl: apiUrl,
				body: truncate(body),
				passwordLength: password.length,
				status: error.response.status,
				statusText: error.response.statusText,
				usernameLength: username.length,
			});
			throw new Error(
				`QPay auth failed (${error.response.status}): ${body.slice(0, 300)} [base=${apiUrl} userLen=${username.length} passLen=${password.length}]`,
				{ cause: error },
			);
		}
		if (error instanceof SyntaxError) {
			throw new Error(`QPay auth returned invalid JSON: ${error.message}`, { cause: error });
		}
		throw error;
	}

	const expirationTtl = resolveTokenTtlFromUnixSeconds(authResponse.expires_in);
	await env.vitStoreKV.put(QPAY_ACCESS_TOKEN_KEY, authResponse.access_token, {
		expirationTtl,
	});
	logger.info("qpay access token stored", { expirationTtl });

	return authResponse.access_token;
};

const qpayClient = ky.create({
	hooks: {
		afterResponse: [
			async (request, options, response) => {
				logger.info("qpay response", {
					durationMs: Date.now() - (requestStartedAt.get(request) ?? Date.now()),
					method: request.method,
					status: response.status,
					url: request.url,
				});
				if (response.status !== 401) {
					return response;
				}

				if (request.headers.get("x-qpay-retried") === "1") {
					return response;
				}

				const body = await response.clone().text();
				logger.warn("qpay token rejected, refreshing and retrying request", {
					body: truncate(body),
					method: request.method,
					status: response.status,
					url: request.url,
				});
				await env.vitStoreKV.delete(QPAY_ACCESS_TOKEN_KEY);
				const refreshedToken = await getAccessToken({ forceRefresh: true });

				const retryRequest = new Request(request);
				retryRequest.headers.set("Authorization", `Bearer ${refreshedToken}`);
				retryRequest.headers.set("x-qpay-retried", "1");

				return await ky(retryRequest, options);
			},
		],
		beforeError: [
			async (error) => {
				const body = await error.response.clone().text();
				logger.error("qpay error", {
					body: truncate(body),
					method: error.request.method,
					status: error.response.status,
					statusText: error.response.statusText,
					url: error.request.url,
				});
				return error;
			},
		],
		beforeRequest: [
			async (request) => {
				requestStartedAt.set(request, Date.now());
				logger.info("qpay request", {
					method: request.method,
					url: request.url,
				});
				const token = await getAccessToken();
				request.headers.set("Authorization", `Bearer ${token}`);
			},
		],
	},
	prefixUrl: apiUrl,
});

export const createQpayInvoice = async (amount: number, paymentNumber: string) => {
	const callbackUrl = new URL(
		env.QPAY_CALLBACK_URL ?? `${new URL(env.GOOGLE_CALLBACK_URL).origin}/webhooks/qpay`,
	);
	callbackUrl.searchParams.set("id", paymentNumber);

	logger.info("creating qpay invoice", {
		amount,
		callbackUrl: callbackUrl.toString(),
		paymentNumber,
	});

	try {
		const response = v.parse(
			invoiceResponseSchema,
			await qpayClient
				.post("invoice", {
					json: {
						amount,
						callback_url: callbackUrl.toString(),
						invoice_code: "AMERIK_VITAMIN_INVOICE",
						invoice_description: `${paymentNumber}`,
						invoice_receiver_code: "terminal",
						sender_branch_code: "SALBAR1",
						sender_invoice_no: paymentNumber,
					},
				})
				.json(),
		);

		logger.info("qpay invoice created", {
			amount,
			invoiceId: response.invoice_id,
			paymentNumber,
		});
		return response;
	} catch (error) {
		if (error instanceof HTTPError) {
			const body = await error.response.text();
			throw new Error(
				`QPay invoice create failed (${error.response.status}): ${body.slice(0, 300)}`,
				{ cause: error },
			);
		}
		if (error instanceof SyntaxError) {
			throw new Error(`QPay invoice returned invalid JSON: ${error.message}`, { cause: error });
		}
		throw error;
	}
};
export const checkQpayInvoice = async (invoiceId: string) => {
	logger.info("checking qpay invoice", { invoiceId });
	const response = v.parse(
		paymentResponseSchema,
		await qpayClient
			.post("payment/check", {
				json: {
					object_id: invoiceId,
					object_type: "INVOICE",
					offset: {
						page_limit: 100,
						page_number: 1,
					},
				},
			})
			.json(),
	);
	const latestPayment = response.rows[0];
	if (!latestPayment) {
		logger.info("qpay invoice has no payments", {
			invoiceId,
			paidAmount: response.paid_amount,
			paymentCount: response.count,
		});
		return false;
	}

	const isPaid = latestPayment.payment_status === "PAID";
	logger.info("qpay invoice checked", {
		invoiceId,
		isPaid,
		latestPaymentStatus: latestPayment.payment_status,
		paidAmount: response.paid_amount,
		paymentCount: response.count,
	});
	return isPaid;
};
