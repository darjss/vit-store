import { createEnv } from "@t3-oss/env-core";
import * as v from "valibot";

const requiredString = () => v.pipe(v.string(), v.minLength(1));
const requiredUrl = () => v.pipe(v.string(), v.url());

type RuntimeEnv = NodeJS.ProcessEnv;

export const createServerAlchemyEnv = (runtimeEnv: RuntimeEnv = process.env) => {
	return createEnv({
		runtimeEnvStrict: {
			ADMIN_BOT_TOKEN: runtimeEnv.ADMIN_BOT_TOKEN,
			CORS_ORIGIN: runtimeEnv.CORS_ORIGIN,
			DASH_URL: runtimeEnv.DASH_URL,
			DELIVERY_API_URL: runtimeEnv.DELIVERY_API_URL,
			DELIVERY_PASSWORD: runtimeEnv.DELIVERY_PASSWORD,
			DELIVERY_SENDERID: runtimeEnv.DELIVERY_SENDERID,
			DELIVERY_USERNAME: runtimeEnv.DELIVERY_USERNAME,
			DOMAIN: runtimeEnv.DOMAIN,
			FIRECRAWL_API_KEY: runtimeEnv.FIRECRAWL_API_KEY,
			GOOGLE_CALLBACK_URL: runtimeEnv.GOOGLE_CALLBACK_URL,
			GOOGLE_CLIENT_ID: runtimeEnv.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: runtimeEnv.GOOGLE_CLIENT_SECRET,
			IMAGE_UPLOAD_TOKEN: runtimeEnv.IMAGE_UPLOAD_TOKEN,
			KHAAN_ACCOUNT_NAME: runtimeEnv.KHAAN_ACCOUNT_NAME,
			KHAAN_ACCOUNT_NUMBER: runtimeEnv.KHAAN_ACCOUNT_NUMBER,
			KHAAN_BRANCH_CODE: runtimeEnv.KHAAN_BRANCH_CODE,
			KHAAN_DEVICE_ID: runtimeEnv.KHAAN_DEVICE_ID,
			KHAAN_PASSWORD: runtimeEnv.KHAAN_PASSWORD,
			KHAAN_USER_AGENT: runtimeEnv.KHAAN_USER_AGENT,
			KHAAN_USERNAME: runtimeEnv.KHAAN_USERNAME,
			MESSENGER_ACCESS_TOKEN: runtimeEnv.MESSENGER_ACCESS_TOKEN,
			MESSENGER_VERIFY_TOKEN: runtimeEnv.MESSENGER_VERIFY_TOKEN,
			OPENCODE_GO_API_KEY: runtimeEnv.OPENCODE_GO_API_KEY,
			PLANETSCALE_DATABASE: runtimeEnv.PLANETSCALE_DATABASE,
			PLANETSCALE_HOST: runtimeEnv.PLANETSCALE_HOST,
			PLANETSCALE_PASSWORD: runtimeEnv.PLANETSCALE_PASSWORD,
			PLANETSCALE_USER: runtimeEnv.PLANETSCALE_USER,
			POSTHOG_API_KEY: runtimeEnv.POSTHOG_API_KEY,
			POSTHOG_HOST: runtimeEnv.POSTHOG_HOST,
			POSTHOG_PROJECT_API_KEY: runtimeEnv.POSTHOG_PROJECT_API_KEY,
			POSTHOG_PROJECT_ID: runtimeEnv.POSTHOG_PROJECT_ID,
			QPAY_CALLBACK_URL: runtimeEnv.QPAY_CALLBACK_URL,
			QPAY_PASSWORD: runtimeEnv.QPAY_PASSWORD,
			QPAY_URL: runtimeEnv.QPAY_URL,
			QPAY_USERNAME: runtimeEnv.QPAY_USERNAME,
			RESTOCK_FROM_EMAIL: runtimeEnv.RESTOCK_FROM_EMAIL,
			SMS_GATEWAY_LOGIN: runtimeEnv.SMS_GATEWAY_LOGIN,
			SMS_GATEWAY_PASSWORD: runtimeEnv.SMS_GATEWAY_PASSWORD,
			TELEGRAM_ADMIN_BOT_TOKEN: runtimeEnv.TELEGRAM_ADMIN_BOT_TOKEN,
			TELEGRAM_ADMIN_CHAT_ID: runtimeEnv.TELEGRAM_ADMIN_CHAT_ID,
			UPSTASH_REDIS_REST_TOKEN: runtimeEnv.UPSTASH_REDIS_REST_TOKEN,
			UPSTASH_REDIS_REST_URL: runtimeEnv.UPSTASH_REDIS_REST_URL,
			UPSTASH_SEARCH_TOKEN: runtimeEnv.UPSTASH_SEARCH_TOKEN,
			UPSTASH_SEARCH_URL: runtimeEnv.UPSTASH_SEARCH_URL,
		},
		server: {
			ADMIN_BOT_TOKEN: v.optional(v.string()),
			CORS_ORIGIN: requiredString(),
			DASH_URL: requiredUrl(),
			DELIVERY_API_URL: requiredUrl(),
			DELIVERY_PASSWORD: requiredString(),
			DELIVERY_SENDERID: requiredString(),
			DELIVERY_USERNAME: requiredString(),
			DOMAIN: requiredString(),
			FIRECRAWL_API_KEY: requiredString(),
			GOOGLE_CALLBACK_URL: requiredUrl(),
			GOOGLE_CLIENT_ID: requiredString(),
			GOOGLE_CLIENT_SECRET: requiredString(),
			IMAGE_UPLOAD_TOKEN: requiredString(),
			KHAAN_ACCOUNT_NAME: v.optional(requiredString(), "Aviddaram Bazarragchaa"),
			KHAAN_ACCOUNT_NUMBER: requiredString(),
			KHAAN_BRANCH_CODE: v.optional(requiredString(), "5041"),
			KHAAN_DEVICE_ID: requiredString(),
			KHAAN_PASSWORD: requiredString(),
			KHAAN_USER_AGENT: v.optional(requiredString()),
			KHAAN_USERNAME: requiredString(),
			MESSENGER_ACCESS_TOKEN: requiredString(),
			MESSENGER_VERIFY_TOKEN: requiredString(),
			OPENCODE_GO_API_KEY: requiredString(),
			PLANETSCALE_DATABASE: requiredString(),
			PLANETSCALE_HOST: requiredString(),
			PLANETSCALE_PASSWORD: requiredString(),
			PLANETSCALE_USER: requiredString(),
			POSTHOG_API_KEY: requiredString(),
			POSTHOG_HOST: v.optional(requiredUrl(), "https://us.i.posthog.com"),
			POSTHOG_PROJECT_API_KEY: requiredString(),
			POSTHOG_PROJECT_ID: requiredString(),
			QPAY_CALLBACK_URL: v.optional(requiredUrl()),
			QPAY_PASSWORD: requiredString(),
			QPAY_URL: requiredUrl(),
			QPAY_USERNAME: requiredString(),
			RESTOCK_FROM_EMAIL: requiredString(),
			SMS_GATEWAY_LOGIN: requiredString(),
			SMS_GATEWAY_PASSWORD: requiredString(),
			TELEGRAM_ADMIN_BOT_TOKEN: v.optional(requiredString()),
			TELEGRAM_ADMIN_CHAT_ID: v.optional(requiredString()),
			UPSTASH_REDIS_REST_TOKEN: requiredString(),
			UPSTASH_REDIS_REST_URL: requiredUrl(),
			UPSTASH_SEARCH_TOKEN: requiredString(),
			UPSTASH_SEARCH_URL: requiredUrl(),
		},
	});
};

export const createAdminAlchemyEnv = (runtimeEnv: RuntimeEnv = process.env) => {
	return createEnv({
		runtimeEnvStrict: {
			VITE_SERVER_URL: runtimeEnv.VITE_SERVER_URL,
		},
		server: {
			VITE_SERVER_URL: requiredUrl(),
		},
	});
};

export const createStoreAlchemyEnv = (runtimeEnv: RuntimeEnv = process.env) => {
	return createEnv({
		runtimeEnvStrict: {
			PUBLIC_API_URL: runtimeEnv.PUBLIC_API_URL,
		},
		server: {
			PUBLIC_API_URL: requiredUrl(),
		},
	});
};
