import { env } from "cloudflare:workers";
import ky, { HTTPError } from "ky";

interface AuthResponse {
	tokenType: string;
	accessToken: string;
	expiresIn: number;
	refreshToken: string;
	refreshExpiresIn: number;
	unit: "SECONDS" | string;
}

interface InvoiceRequestBody {
	totalAmount: number;
	transactionId: string;
	products: {
		image: string;
		title: string;
    amount: number;
    remark: string;
		count: number;
	}[];
}

export interface InvoiceResponse {
	invoiceId: string;
	followUpLink: string;
}

interface BonumErrorResponse {
	code?: string;
	message?: string;
	error?: string;
	errors?: Record<string, string[]>;
}

export class BonumApiError extends Error {
	public statusCode: number;
	public responseBody: BonumErrorResponse | string;
	public requestBody?: unknown;

	constructor(
		message: string,
		statusCode: number,
		responseBody: BonumErrorResponse | string,
		requestBody?: unknown,
	) {
		super(message);
		this.name = "BonumApiError";
		this.statusCode = statusCode;
		this.responseBody = responseBody;
		this.requestBody = requestBody;
	}
}

const apiUrl = env.BONUM_URL;

const parseErrorResponse = async (
	error: HTTPError,
): Promise<BonumErrorResponse | string> => {
	try {
		const text = await error.response.text();
		try {
			return JSON.parse(text) as BonumErrorResponse;
		} catch {
			return text;
		}
	} catch {
		return "Failed to read error response";
	}
};

const getAccessToken = async () => {
	const tokenFromKV = await env.vitStoreKV.get("bonum_access_token");
	if (tokenFromKV) {
		return tokenFromKV;
	}

	try {
		const authResponse = await ky
			.get(`${apiUrl}ecommerce/auth/create`, {
				headers: {
					"content-type": "application/json",
					"X-TERMINAL-ID": env.BONUM_TERMINAL_ID,
					Authorization: `AppSecret ${env.BONUM_APP_SECRET}`,
				},
			})
			.json<AuthResponse>();

		const accessToken = authResponse.accessToken;
		await env.vitStoreKV.put("bonum_access_token", accessToken, {
			expirationTtl: authResponse.expiresIn,
		});
		return accessToken;
	} catch (error) {
		if (error instanceof HTTPError) {
			const responseBody = await parseErrorResponse(error);
			console.error("[Bonum Auth Error]", {
				statusCode: error.response.status,
				responseBody,
			});
			throw new BonumApiError(
				`Bonum authentication failed: ${error.response.status}`,
				error.response.status,
				responseBody,
			);
		}
		console.error("[Bonum Auth Error] Unexpected error:", error);
		throw error;
	}
};

const bonumClient = ky.create({
	prefixUrl: apiUrl,
	hooks: {
		beforeRequest: [
			async (request) => {
				const accessToken = await getAccessToken();
				request.headers.set("Authorization", `Bearer ${accessToken}`);
			},
		],
	},
});

export const createInvoice = async (request: InvoiceRequestBody) => {
	const storefrontUrl = env.CORS_ORIGIN.split(",")[1];
	const requestBody = {
		transactionId: request.transactionId,
    amount: request.totalAmount,
    expiresIn: 1800,
		callback: `${storefrontUrl}/payment/success/${request.transactionId}`,
		items: request.products,
	};

	try {
		const response = await bonumClient
			.post("ecommerce/invoices", {
				json: requestBody,
			})
			.json<InvoiceResponse>();

		console.log("[Bonum] Invoice created successfully", {
			invoiceId: response.invoiceId,
			transactionId: request.transactionId,
		});

		return response;
	} catch (error) {
		if (error instanceof HTTPError) {
			const responseBody = await parseErrorResponse(error);
			console.error("[Bonum Create Invoice Error]", {
				statusCode: error.response.status,
				responseBody,
				requestBody: {
					...requestBody,
					items: `[${request.products.length} items]`,
				},
			});
			throw new BonumApiError(
				`Bonum create invoice failed: ${error.response.status} - ${
					typeof responseBody === "string"
						? responseBody
						: responseBody.message ||
							responseBody.error ||
							JSON.stringify(responseBody)
				}`,
				error.response.status,
				responseBody,
				requestBody,
			);
		}
		console.error("[Bonum Create Invoice Error] Unexpected error:", error);
		throw error;
	}
};
