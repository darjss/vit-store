export interface CloudflareBindings {
	vitStoreKV: KVNamespace;
	DASH_URL: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_CALLBACK_URL: string;
	CORS_ORIGIN: string;
	DOMAIN: string;
	r2Bucket: R2Bucket;
	DB: D1Database;
	RATE_LIMITER: RateLimit;
}
