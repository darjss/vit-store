export interface PostHogConfig {
	apiKey: string;
	projectId: string;
	host: string;
}

export interface HogQLQueryResult {
	results: unknown[][];
	columns: string[];
	types: string[];
	hasMore?: boolean;
}

export interface PostHogQueryResponse {
	results: unknown[][];
	columns: string[];
	types: string[];
	hasMore?: boolean;
	error?: string;
}

export interface UpstashProductMetadata {
	productId: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	category: string;
	image: string;
}

export interface SearchProductResult {
	id: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	image: string;
}

export interface HttpClient {
	get<T>(url: string, headers?: Record<string, string>): Promise<T>;
	post<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	put<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	patch<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	delete<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

export interface TokenRequest {
	scopes: string[];
	ttl?: number;
}

export interface SmsTokenResponse {
	access_token: string;
	token_type: string;
	id: string;
	expires_at: string;
}

export interface SmsGatewayConfig {
	login: string;
	password: string;
	baseUrl?: string;
}
