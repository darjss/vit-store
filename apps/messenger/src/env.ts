import type { Admin } from "./admin/admin";
import type { Conversation } from "./conversation";
import type { Ingress } from "./ingress";

export interface Env extends Cloudflare.Env {
	Admin: DurableObjectNamespace<Admin>;
	ADMIN_BOT_TOKEN?: string;
	ADMIN_TOKEN?: string;
	AI?: Ai;
	Conversation: DurableObjectNamespace<Conversation>;
	INBOX_RECOVER_SECONDS?: string;
	Ingress: DurableObjectNamespace<Ingress>;
	LLM?: Fetcher;
	LOADER?: WorkerLoader;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
	MODEL?: string;
	OPENAI_API_KEY: string;
	OPENAI_BASE_URL?: string;
	PAYMENT_WATCH_SECONDS?: string;
	PAYMENT_WATCH_SLOW_SECONDS?: string;
	PHOTO_HOSTS?: string;
	STORE_API_URL: string;
	STORE_PUBLIC_URL?: string;
	TELEGRAM_ADMIN_BOT_TOKEN?: string;
	TELEGRAM_ADMIN_CHAT_ID?: string;
	TELEGRAM_API_BASE?: string;
	TELEGRAM_WEBHOOK_SECRET?: string;
	ZERNIO_ACCOUNT_IDS?: string;
	ZERNIO_API_KEY: string;
	ZERNIO_BASE_URL?: string;
	ZERNIO_WEBHOOK_SECRET: string;
}

export const accountIds = (env: Env): Array<string> =>
	(env.ZERNIO_ACCOUNT_IDS ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);

export const zernioBaseUrl = (env: Env): string =>
	(env.ZERNIO_BASE_URL ?? "https://zernio.com/api").replace(/\/+$/, "");
