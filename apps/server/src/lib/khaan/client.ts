type KhaanLoginResponse = {
	access_token?: string;
	access_token_expires_in?: string;
	refresh_token?: string;
	refresh_token_status?: string;
	refresh_token_expires_in?: string;
	display_name?: string;
	primary_account_id?: string;
	unique_id?: string;
	message?: string;
};

type KhaanErrorResponse = {
	message?: string;
	error?: string;
	code?: string;
};

export type KhaanLoginResult =
	| { status: "logged_in"; accessToken: string }
	| { status: "mfa_required"; requestId?: string }
	| { status: "failed"; error: string };

/**
 * Transaction shape from the current Khan Bank web API:
 *   GET /v3/account-omni/statement/{accountId}/recent/omni
 *
 * The old `/omni/user/custom/operativeaccounts/{id}/transactions` endpoint
 * is deprecated and returns empty results for all accounts.
 */
export type KhaanTransaction = {
	tranDate?: string;
	time?: string;
	amount?: number;
	description?: string;
	balance?: number;
	relatedAccount?: string;
};

export type KhaanClientConfig = {
	username: string;
	password: string;
	deviceId: string;
	userAgent?: string;
	accountNumber: string;
	branchCode?: string;
};

const TOKEN_URL = "https://e.khanbank.com/v3/cfrm/auth/token";
const BASE_URL = "https://e.khanbank.com/v3";

const base64Encode = (value: string) => btoa(value);

const readErrorMessage = async (response: Response) => {
	const body = await response.clone().text();
	try {
		const parsed = JSON.parse(body) as KhaanErrorResponse;
		return parsed.message ?? parsed.error ?? parsed.code ?? body;
	} catch {
		return body || `Khaan request failed with ${response.status}`;
	}
};

export class KhaanClient {
	constructor(private readonly config: KhaanClientConfig) {}

	async loginInitial(): Promise<KhaanLoginResult> {
		const response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: this.headers({ contentType: "application/json" }),
			body: JSON.stringify({
				username: this.config.username,
				password: base64Encode(this.config.password),
				grant_type: "password",
				channelId: "I",
				languageId: "003",
			}),
		});

		if (!response.ok) {
			return { status: "failed", error: await readErrorMessage(response) };
		}

		const body = (await response.json()) as KhaanLoginResponse;
		if (body.access_token) {
			return { status: "logged_in", accessToken: body.access_token };
		}

		return { status: "mfa_required", requestId: body.unique_id };
	}

	/**
	 * Fetch recent transactions. The current Khan Bank web API only exposes
	 * a "recent" endpoint (10 latest transactions) — the old date-ranged
	 * endpoint is deprecated. For reconciliation polling, the recent window
	 * is sufficient since we match transfers shortly after they happen.
	 */
	async fetchTransactions(input: {
		accessToken: string;
	}): Promise<KhaanTransaction[]> {
		const url = `${BASE_URL}/account-omni/statement/${this.config.accountNumber}/recent/omni`;
		const response = await fetch(url, {
			method: "GET",
			headers: this.headers({ accessToken: input.accessToken }),
		});

		if (!response.ok) {
			throw new Error(await readErrorMessage(response));
		}

		return (await response.json()) as KhaanTransaction[];
	}

	private headers(input?: {
		accessToken?: string;
		contentType?: string;
	}): HeadersInit {
		const headers: Record<string, string> = {
			"device-id": this.config.deviceId,
			"Accept-Language": "mn-MN",
			secure: "yes",
		};
		if (input?.contentType) {
			headers["Content-Type"] = input.contentType;
		}
		if (input?.accessToken) {
			headers.Authorization = `Bearer ${input.accessToken}`;
		}
		if (this.config.userAgent) {
			headers["User-Agent"] = this.config.userAgent;
		}
		return headers;
	}
}
