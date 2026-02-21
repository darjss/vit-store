export interface TokenResponse {
	token_type: string;
	refresh_expires_in: number;
	refresh_token: string;
	access_token: string;
	expires_in: number;
	scope: string;
	"not-before-policy": string;
	session_state: string;
}

export interface PaymentUrl {
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

export interface P2PTransaction {
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

export interface PaymentRow {
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

export interface PaymentResponse {
	count: number;
	paid_amount: number;
	rows: PaymentRow[];
}

export interface BonumAuthResponse {
	tokenType: string;
	accessToken: string;
	expiresIn: number;
	refreshToken: string;
	refreshExpiresIn: number;
	unit: "SECONDS" | string;
}

export interface BonumInvoiceProduct {
	image: string;
	title: string;
	amount: number;
	remark: string;
	count: number;
}

export interface BonumInvoiceRequestBody {
	totalAmount: number;
	transactionId: string;
	products: BonumInvoiceProduct[];
}

export interface BonumInvoiceResponse {
	invoiceId: string;
	followUpLink: string;
}

export interface BonumErrorResponse {
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
