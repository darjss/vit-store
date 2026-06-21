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

export type KhaanTransaction = {
	transactionDate?: string;
	accountId?: string;
	amountType?: {
		codeType?: string;
		cmCode?: string;
		codeDescription?: string;
	};
	amount?: {
		amount?: number;
		currency?: string;
	};
	transactionRemarks?: string;
	txnTime?: string;
	beginBalance?: {
		amount?: number;
		currency?: string;
	};
	endBalance?: {
		amount?: number;
		currency?: string;
	};
	txnBranchId?: string;
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

const formatKhaanDate = (date: Date) => date.toISOString().slice(0, 19);

const readErrorMessage = async (response: Response) => {
	const body = await response.text();
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

	async fetchTransactions(input: {
		accessToken: string;
		start: Date;
		end: Date;
		currency?: string;
	}): Promise<KhaanTransaction[]> {
		const params = new URLSearchParams({
			transactionValue: "0",
			transactionDate: JSON.stringify({
				gt: formatKhaanDate(input.start),
				lt: formatKhaanDate(input.end),
			}),
			amountType: "04",
			transactionCategoryId: "",
			transactionRemarks: "",
			transactionCurrency: input.currency ?? "MNT",
			branchCode:
				this.config.branchCode ??
				this.config.accountNumber.slice(0, 4) ??
				"5041",
		});
		const url = `${BASE_URL}/omni/user/custom/operativeaccounts/${this.config.accountNumber}/transactions?${params.toString()}`;
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
