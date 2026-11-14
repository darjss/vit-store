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
