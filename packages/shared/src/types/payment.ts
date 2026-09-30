export interface TokenResponse {
	access_token: string;
	expires_in: number;
	"not-before-policy": string;
	refresh_expires_in: number;
	refresh_token: string;
	scope: string;
	session_state: string;
	token_type: string;
}

export interface PaymentUrl {
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

export interface P2PTransaction {
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

export interface PaymentRow {
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

export interface PaymentResponse {
	count: number;
	paid_amount: number;
	rows: Array<PaymentRow>;
}

export interface BonumAuthResponse {
	accessToken: string;
	expiresIn: number;
	refreshExpiresIn: number;
	refreshToken: string;
	tokenType: string;
	unit: "SECONDS" | string;
}

export interface BonumInvoiceProduct {
	amount: number;
	count: number;
	image: string;
	remark: string;
	title: string;
}

export interface BonumInvoiceRequestBody {
	products: Array<BonumInvoiceProduct>;
	totalAmount: number;
	transactionId: string;
}

export interface BonumInvoiceResponse {
	followUpLink: string;
	invoiceId: string;
}

export interface BonumErrorResponse {
	code?: string;
	error?: string;
	errors?: Record<string, Array<string>>;
	message?: string;
}

export class BonumApiError extends Error {
	public statusCode: number;
	public responseBody: BonumErrorResponse | string;
	public requestBody?: BonumInvoiceRequestBody;

	constructor(
		message: string,
		statusCode: number,
		responseBody: BonumErrorResponse | string,
		requestBody?: BonumInvoiceRequestBody,
	) {
		super(message);
		this.name = "BonumApiError";
		this.statusCode = statusCode;
		this.responseBody = responseBody;
		this.requestBody = requestBody;
	}
}
