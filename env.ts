import { createEnv } from "@t3-oss/env-core";
import * as v from "valibot";

const requiredString = () => v.pipe(v.string(), v.minLength(1));
const requiredUrl = () => v.pipe(v.string(), v.url());

type RuntimeEnv = NodeJS.ProcessEnv;

export const createServerAlchemyEnv = (
	runtimeEnv: RuntimeEnv = process.env,
) => {
	return createEnv({
		server: {
			PLANETSCALE_HOST: requiredString(),
			PLANETSCALE_USER: requiredString(),
			PLANETSCALE_PASSWORD: requiredString(),
			PLANETSCALE_DATABASE: requiredString(),
			CORS_ORIGIN: requiredString(),
			DASH_URL: requiredUrl(),
			GOOGLE_CLIENT_ID: requiredString(),
			GOOGLE_CLIENT_SECRET: requiredString(),
			GOOGLE_CALLBACK_URL: requiredUrl(),
			DOMAIN: requiredString(),
			MESSENGER_ACCESS_TOKEN: requiredString(),
			MESSENGER_VERIFY_TOKEN: requiredString(),
			SMS_GATEWAY_LOGIN: requiredString(),
			SMS_GATEWAY_PASSWORD: requiredString(),
			RESEND_API_KEY: requiredString(),
			RESTOCK_FROM_EMAIL: requiredString(),
			FIRECRAWL_API_KEY: requiredString(),
			OPENCODE_GO_API_KEY: requiredString(),
			UPSTASH_SEARCH_URL: requiredUrl(),
			UPSTASH_SEARCH_TOKEN: requiredString(),
			UPSTASH_REDIS_REST_URL: requiredUrl(),
			UPSTASH_REDIS_REST_TOKEN: requiredString(),
			QPAY_URL: requiredUrl(),
			QPAY_USERNAME: requiredString(),
			QPAY_PASSWORD: requiredString(),
			QPAY_CALLBACK_URL: v.optional(requiredUrl()),
			KHAAN_USERNAME: requiredString(),
			KHAAN_PASSWORD: requiredString(),
			KHAAN_DEVICE_ID: requiredString(),
			KHAAN_USER_AGENT: v.optional(requiredString()),
			KHAAN_ACCOUNT_NUMBER: requiredString(),
			KHAAN_ACCOUNT_NAME: v.optional(requiredString(), "Aviddaram Bazarragchaa"),
			KHAAN_BRANCH_CODE: v.optional(requiredString(), "5041"),
			POSTHOG_API_KEY: requiredString(),
			POSTHOG_PROJECT_API_KEY: requiredString(),
			POSTHOG_PROJECT_ID: requiredString(),
			POSTHOG_HOST: v.optional(requiredUrl(), "https://us.i.posthog.com"),
			DELIVERY_API_URL: requiredUrl(),
			DELIVERY_USERNAME: requiredString(),
			DELIVERY_PASSWORD: requiredString(),
			DELIVERY_SENDERID: requiredString(),
			ADMIN_BOT_TOKEN: v.optional(v.string()),
		},
		runtimeEnvStrict: {
			PLANETSCALE_HOST: runtimeEnv.PLANETSCALE_HOST,
			PLANETSCALE_USER: runtimeEnv.PLANETSCALE_USER,
			PLANETSCALE_PASSWORD: runtimeEnv.PLANETSCALE_PASSWORD,
			PLANETSCALE_DATABASE: runtimeEnv.PLANETSCALE_DATABASE,
			CORS_ORIGIN: runtimeEnv.CORS_ORIGIN,
			DASH_URL: runtimeEnv.DASH_URL,
			GOOGLE_CLIENT_ID: runtimeEnv.GOOGLE_CLIENT_ID,
			GOOGLE_CLIENT_SECRET: runtimeEnv.GOOGLE_CLIENT_SECRET,
			GOOGLE_CALLBACK_URL: runtimeEnv.GOOGLE_CALLBACK_URL,
			DOMAIN: runtimeEnv.DOMAIN,
			MESSENGER_ACCESS_TOKEN: runtimeEnv.MESSENGER_ACCESS_TOKEN,
			MESSENGER_VERIFY_TOKEN: runtimeEnv.MESSENGER_VERIFY_TOKEN,
			SMS_GATEWAY_LOGIN: runtimeEnv.SMS_GATEWAY_LOGIN,
			SMS_GATEWAY_PASSWORD: runtimeEnv.SMS_GATEWAY_PASSWORD,
			RESEND_API_KEY: runtimeEnv.RESEND_API_KEY,
			RESTOCK_FROM_EMAIL: runtimeEnv.RESTOCK_FROM_EMAIL,
			FIRECRAWL_API_KEY: runtimeEnv.FIRECRAWL_API_KEY,
			OPENCODE_GO_API_KEY: runtimeEnv.OPENCODE_GO_API_KEY,
			UPSTASH_SEARCH_URL: runtimeEnv.UPSTASH_SEARCH_URL,
			UPSTASH_SEARCH_TOKEN: runtimeEnv.UPSTASH_SEARCH_TOKEN,
			UPSTASH_REDIS_REST_URL: runtimeEnv.UPSTASH_REDIS_REST_URL,
			UPSTASH_REDIS_REST_TOKEN: runtimeEnv.UPSTASH_REDIS_REST_TOKEN,
			QPAY_URL: runtimeEnv.QPAY_URL,
			QPAY_USERNAME: runtimeEnv.QPAY_USERNAME,
			QPAY_PASSWORD: runtimeEnv.QPAY_PASSWORD,
			QPAY_CALLBACK_URL: runtimeEnv.QPAY_CALLBACK_URL,
			KHAAN_USERNAME: runtimeEnv.KHAAN_USERNAME,
			KHAAN_PASSWORD: runtimeEnv.KHAAN_PASSWORD,
			KHAAN_DEVICE_ID: runtimeEnv.KHAAN_DEVICE_ID,
			KHAAN_USER_AGENT: runtimeEnv.KHAAN_USER_AGENT,
			KHAAN_ACCOUNT_NUMBER: runtimeEnv.KHAAN_ACCOUNT_NUMBER,
			KHAAN_ACCOUNT_NAME: runtimeEnv.KHAAN_ACCOUNT_NAME,
			KHAAN_BRANCH_CODE: runtimeEnv.KHAAN_BRANCH_CODE,
			POSTHOG_API_KEY: runtimeEnv.POSTHOG_API_KEY,
			POSTHOG_PROJECT_API_KEY: runtimeEnv.POSTHOG_PROJECT_API_KEY,
			POSTHOG_PROJECT_ID: runtimeEnv.POSTHOG_PROJECT_ID,
			POSTHOG_HOST: runtimeEnv.POSTHOG_HOST,
			DELIVERY_API_URL: runtimeEnv.DELIVERY_API_URL,
			DELIVERY_USERNAME: runtimeEnv.DELIVERY_USERNAME,
			DELIVERY_PASSWORD: runtimeEnv.DELIVERY_PASSWORD,
			DELIVERY_SENDERID: runtimeEnv.DELIVERY_SENDERID,
			ADMIN_BOT_TOKEN: runtimeEnv.ADMIN_BOT_TOKEN,
		},
	});
};

export const createAdminAlchemyEnv = (runtimeEnv: RuntimeEnv = process.env) => {
	return createEnv({
		server: {
			VITE_SERVER_URL: requiredUrl(),
		},
		runtimeEnvStrict: {
			VITE_SERVER_URL: runtimeEnv.VITE_SERVER_URL,
		},
	});
};

export const createStoreAlchemyEnv = (runtimeEnv: RuntimeEnv = process.env) => {
	return createEnv({
		server: {
			PUBLIC_API_URL: requiredUrl(),
		},
		runtimeEnvStrict: {
			PUBLIC_API_URL: runtimeEnv.PUBLIC_API_URL,
		},
	});
};
