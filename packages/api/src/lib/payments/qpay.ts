import { logger } from "~/lib/logger";
import { env } from "cloudflare:workers";
import ky, { HTTPError } from "ky";

const apiUrl = env.QPAY_URL.endsWith("/") ? env.QPAY_URL : `${env.QPAY_URL}/`;
const requestStartedAt = new WeakMap<Request, number>();

const truncate = (value: string, maxLength = 500) =>
	value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

interface TokenResponse {
	token_type: string;
	refresh_expires_in: number;
	refresh_token: string;
	access_token: string;
	expires_in: number;
	scope: string;
	"not-before-policy": string;
	session_state: string;
}

interface PaymentUrl {
	name: string;
	description: string;
	logo: string;
	link: string;
}

export interface InvoiceResponse {
	invoice_id: string;
	qr_text: string;
	qr_image: string;
	qPay_shortUrl: string;
	urls: PaymentUrl[];
}

interface P2PTransaction {
	id: string;
	transaction_bank_code: string;
	account_bank_code: string;
	account_bank_name: string;
	account_number: string;
	status: string;
	amount: string;
	currency: string;
	settlement_status: string;
}

interface PaymentRow {
	payment_id: string;
	payment_status: string;
	payment_amount: string;
	trx_fee: string;
	payment_currency: string;
	payment_wallet: string;
	payment_type: string;
	next_payment_date: string | null;
	next_payment_datetime: string | null;
	card_transactions: unknown[];
	p2p_transactions: P2PTransaction[];
}

interface PaymentResponse {
	count: number;
	paid_amount: number;
	rows: PaymentRow[];
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
				status: error.response.status,
				statusText: error.response.statusText,
				body: truncate(body),
				baseUrl: apiUrl,
				usernameLength: username.length,
				passwordLength: password.length,
			});
			throw new Error(
				`QPay auth failed (${error.response.status}): ${body.slice(0, 300)} [base=${apiUrl} userLen=${username.length} passLen=${password.length}]`,
			);
		}
		if (error instanceof SyntaxError) {
			throw new Error(`QPay auth returned invalid JSON: ${error.message}`);
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
	prefixUrl: apiUrl,
	hooks: {
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
		afterResponse: [
			async (request, options, response) => {
				logger.info("qpay response", {
					method: request.method,
					url: request.url,
					status: response.status,
					durationMs: Date.now() - (requestStartedAt.get(request) ?? Date.now()),
				});
				if (response.status !== 401) {
					return response;
				}

				if (request.headers.get("x-qpay-retried") === "1") {
					return response;
				}

				const body = await response.clone().text();
				if (!body.includes("NO_CREDENDIALS")) {
					return response;
				}

				logger.warn("qpay token rejected, refreshing and retrying request", {
					method: request.method,
					url: request.url,
					status: response.status,
					body: truncate(body),
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
					method: error.request.method,
					url: error.request.url,
					status: error.response.status,
					statusText: error.response.statusText,
					body: truncate(body),
				});
				return error;
			},
		],
	},
});

export const createQpayInvoice = async (
	amount: number,
	paymentNumber: string,
) => {
	const callbackUrl = new URL(
		env.QPAY_CALLBACK_URL ??
			`${new URL(env.GOOGLE_CALLBACK_URL).origin}/webhooks/qpay`,
	);
	callbackUrl.searchParams.set("id", paymentNumber);

	logger.info("creating qpay invoice", {
		paymentNumber,
		amount,
		callbackUrl: callbackUrl.toString(),
	});

	try {
		const response = await qpayClient
			.post("invoice", {
				json: {
					invoice_code: "AMERIK_VITAMIN_INVOICE",
					sender_invoice_no: paymentNumber,
					invoice_receiver_code: "terminal",
					invoice_description: `${paymentNumber}`,
					sender_branch_code: "SALBAR1",
					amount: amount,
					callback_url: callbackUrl.toString(),
				},
			})
			.json<InvoiceResponse>();

		logger.info("qpay invoice created", {
			paymentNumber,
			invoiceId: response.invoice_id,
			amount,
		});
		return response;
	} catch (error) {
		if (error instanceof HTTPError) {
			const body = await error.response.text();
			throw new Error(
				`QPay invoice create failed (${error.response.status}): ${body.slice(0, 300)}`,
			);
		}
		if (error instanceof SyntaxError) {
			throw new Error(`QPay invoice returned invalid JSON: ${error.message}`);
		}
		throw error;
	}
};
export const checkQpayInvoice = async (invoiceId: string) => {
	logger.info("checking qpay invoice", { invoiceId });
	const response = await qpayClient
		.post("payment/check", {
			json: {
				object_type: "INVOICE",
				object_id: invoiceId,
				offset: {
					page_number: 1,
					page_limit: 100,
				},
			},
		})
		.json<PaymentResponse>();
	const latestPayment = response.rows[0];
	if (!latestPayment) {
		logger.info("qpay invoice has no payments", {
			invoiceId,
			paymentCount: response.count,
			paidAmount: response.paid_amount,
		});
		return false;
	}

	const isPaid = latestPayment.payment_status === "PAID";
	logger.info("qpay invoice checked", {
		invoiceId,
		paymentCount: response.count,
		paidAmount: response.paid_amount,
		latestPaymentStatus: latestPayment.payment_status,
		isPaid,
	});
	return isPaid;
};
