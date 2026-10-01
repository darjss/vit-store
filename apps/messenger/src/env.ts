import type { Conversation } from "./conversation";
import type { Ingress } from "./ingress";

export interface Env extends Cloudflare.Env {
	Conversation: DurableObjectNamespace<Conversation>;
	Ingress: DurableObjectNamespace<Ingress>;
	MODEL?: string;
	OPENAI_API_KEY: string;
	OPENAI_BASE_URL?: string;
	STORE_API_URL: string;
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
