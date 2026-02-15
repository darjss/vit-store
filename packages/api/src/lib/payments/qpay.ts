import { env } from "cloudflare:workers";
import ky, { HTTPError } from "ky";

const apiUrl = env.QPAY_URL.endsWith("/") ? env.QPAY_URL : `${env.QPAY_URL}/`;

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
			return tokenFromKV;
		}
	}

	const username = env.QPAY_USERNAME?.trim();
	const password = env.QPAY_PASSWORD?.trim();
	if (!username || !password) {
		throw new Error("QPay credentials are missing or empty");
	}

	const credentials = btoa(`${username}:${password}`);

	if (process.env.NODE_ENV === "development") {
		console.log("[QPay Auth Debug]", {
			baseUrl: apiUrl,
			username,
			password,
			usernameLength: username.length,
			passwordLength: password.length,
		});
	}

	let authResponse: TokenResponse;
	try {
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
			throw new Error(
				`QPay auth failed (${error.response.status}): ${body.slice(0, 300)} [base=${apiUrl} userLen=${username.length} passLen=${password.length}]`,
			);
		}
		if (error instanceof SyntaxError) {
			throw new Error(`QPay auth returned invalid JSON: ${error.message}`);
		}
		throw error;
	}

	await env.vitStoreKV.put(QPAY_ACCESS_TOKEN_KEY, authResponse.access_token, {
		expirationTtl: resolveTokenTtlFromUnixSeconds(authResponse.expires_in),
	});

	return authResponse.access_token;
};

const qpayClient = ky.create({
	prefixUrl: apiUrl,
	hooks: {
		beforeRequest: [
			async (request) => {
				const token = await getAccessToken();
				request.headers.set("Authorization", `Bearer ${token}`);
			},
		],
		afterResponse: [
			async (request, options, response) => {
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

				await env.vitStoreKV.delete(QPAY_ACCESS_TOKEN_KEY);
				const refreshedToken = await getAccessToken({ forceRefresh: true });

				const retryRequest = new Request(request);
				retryRequest.headers.set("Authorization", `Bearer ${refreshedToken}`);
				retryRequest.headers.set("x-qpay-retried", "1");

				return await ky(retryRequest, options);
			},
		],
	},
});

export const createQpayInvoice = async (
	amount: number,
	paymentNumber: string,
) => {
	const callbackOrigin = new URL(env.GOOGLE_CALLBACK_URL).origin;

	try {
		const response = await qpayClient
			.post("invoice", {
				json: {
					invoice_code: "AMERIK_VITAMIN_INVOICE",
					sender_invoice_no: paymentNumber,
					invoice_receiver_code: "terminal",
					invoice_description: `tulbur ${paymentNumber}`,
					sender_branch_code: "SALBAR1",
					amount: amount,
					callback_url: `${callbackOrigin}/webhooks/qpay?id=${paymentNumber}`,
				},
			})
			.json<InvoiceResponse>();

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
		return false;
	}

	return latestPayment.payment_status === "PAID";
};
