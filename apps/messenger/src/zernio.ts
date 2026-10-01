import * as v from "valibot";
import type { Env } from "./env";
import { zernioBaseUrl } from "./env";

export type ZernioSendBody = {
	accountId: string;
	buttons?: Array<{ payload?: string; title: string; type: "url" | "postback"; url?: string }>;
	message?: string;
	quickReplies?: Array<{ payload: string; title: string }>;
	template?: {
		elements: Array<{
			buttons?: Array<{ payload?: string; title: string; type: "url" | "postback"; url?: string }>;
			imageUrl?: string;
			subtitle?: string;
			title: string;
		}>;
		type: "generic";
	};
};

const sendResponseSchema = v.looseObject({
	data: v.optional(v.looseObject({ messageId: v.optional(v.string()) })),
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// 429 honors Retry-After capped at 5s; 5xx and network errors wait 1s.
const retryDelayMs = (response: Response): number => {
	if (response.status !== 429) {
		return 1000;
	}
	const retryAfter = Number(response.headers.get("retry-after"));
	return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1000;
};

// The single outbound choke point. The caller generates `key` once per logical
// send part (e.g. `${turnId}:text`) and it is reused on the (single) retry, so
// a slow-but-delivered send can't double-post. Retries exactly once on network
// error, 5xx, or 429; a non-2xx after that throws. Returns the Zernio
// messageId, or null when the response doesn't carry one.
export const send = async (
	env: Env,
	conversationId: string,
	body: ZernioSendBody,
	key: string,
): Promise<string | null> => {
	if (body.message) {
		console.log(`[bot.say] ${body.message.replaceAll("\n", " ⏎ ").slice(0, 700)}`);
	}

	const url = `${zernioBaseUrl(env)}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`;

	let status = 0;
	let errorText = "";
	for (let attempt = 0; attempt < 2; attempt++) {
		let response: Response;
		try {
			response = await fetch(url, {
				body: JSON.stringify(body),
				headers: {
					authorization: `Bearer ${env.ZERNIO_API_KEY}`,
					"content-type": "application/json",
					"idempotency-key": key,
				},
				method: "POST",
			});
		} catch (error) {
			if (attempt === 0) {
				await sleep(1000);
				continue;
			}
			throw error;
		}
		if (response.ok) {
			const parsed = v.safeParse(sendResponseSchema, await response.json().catch(() => undefined));
			return parsed.success ? (parsed.output.data?.messageId ?? null) : null;
		}
		status = response.status;
		errorText = await response.text();
		if (attempt === 0 && (status === 429 || status >= 500)) {
			await sleep(retryDelayMs(response));
			continue;
		}
		break;
	}
	throw new Error(`Zernio send failed: ${status} ${errorText}`);
};

// Best-effort typing indicator (Zernio has no "typing off"; it clears on the
// next send). Cosmetic: never fail a turn over one.
export const typing = async (
	env: Env,
	conversationId: string,
	accountId: string,
): Promise<void> => {
	try {
		await fetch(
			`${zernioBaseUrl(env)}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/typing`,
			{
				body: JSON.stringify({ accountId }),
				headers: {
					authorization: `Bearer ${env.ZERNIO_API_KEY}`,
					"content-type": "application/json",
				},
				method: "POST",
			},
		);
	} catch {
		// ignore
	}
};
