import { env } from "cloudflare:workers";
import ky, { HTTPError } from "ky";
import { logger } from "~/lib/logger";

const apiUrl = env.QPAY_URL.endsWith("/") ? env.QPAY_URL : `${env.QPAY_URL}/`;
const requestStartedAt = new WeakMap<Request, number>();

const truncate = (value: string, maxLength = 500) =>
	value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

interface TokenResponse {
	access_token: string;
	expires_in: number;
	"not-before-policy": string;
	refresh_expires_in: number;
	refresh_token: string;
	scope: string;
	session_state: string;
	token_type: string;
}

interface PaymentUrl {
	description: string;
	link: string;
	logo: string;
	name: string;
}

export interface InvoiceResponse {
	invoice_id: string;
	qPay_shortUrl: string;
	qr_image: string;
	qr_text: string;
	urls: Array<PaymentUrl>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const isPaymentUrl = (value: unknown): value is PaymentUrl =>
	isRecord(value) &&
	typeof value.name === "string" &&
	typeof value.description === "string" &&
	typeof value.logo === "string" &&
	typeof value.link === "string";

const isInvoiceResponse = (value: unknown): value is InvoiceResponse =>
	isRecord(value) &&
	typeof value.invoice_id === "string" &&
	value.invoice_id.length > 0 &&
	typeof value.qr_text === "string" &&
	typeof value.qr_image === "string" &&
	typeof value.qPay_shortUrl === "string" &&
	Array.isArray(value.urls) &&
	value.urls.every(isPaymentUrl);

export const parseQpayInvoiceResponse = (value: string) => {
	try {
		const parsed: unknown = JSON.parse(value);
		return isInvoiceResponse(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

interface P2PTransaction {
	account_bank_code: string;
	account_bank_name: string;
	account_number: string;
	amount: string;
	currency: string;
	id: string;
	settlement_status: string;
	status: string;
	transaction_bank_code: string;
}

interface PaymentRow {
	card_transactions: Array<unknown>;
	next_payment_date: string | null;
	next_payment_datetime: string | null;
	p2p_transactions: Array<P2PTransaction>;
	payment_amount: string;
	payment_currency: string;
	payment_id: string;
	payment_status: string;
	payment_type: string;
	payment_wallet: string;
	trx_fee: string;
}

interface PaymentResponse {
	count: number;
	paid_amount: number;
	rows: Array<PaymentRow>;
}

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
		authResponse = await ky
			.post(`${apiUrl}auth/token`, {
				headers: {
					Authorization: `Basic ${credentials}`,
					"Content-Type": "application/json",
				},
			})
			.json<TokenResponse>();
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
		const response = await qpayClient
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
			.json<InvoiceResponse>();

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
	const response = await qpayClient
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
		.json<PaymentResponse>();
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
