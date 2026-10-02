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

const listedMessageSchema = v.looseObject({
	messages: v.optional(
		v.array(
			v.looseObject({
				attachments: v.optional(
					v.array(
						v.looseObject({
							payload: v.optional(v.string()),
							subject: v.optional(v.string()),
						}),
					),
				),
				createdAt: v.optional(v.string()),
				direction: v.optional(v.string()),
				id: v.optional(v.string()),
				message: v.optional(v.string()),
			}),
		),
	),
});

const SEND_TIMEOUT_MS = 30_000;
// Reconcile accepts sends that landed just before we started looking.
const RECONCILE_SKEW_MS = 5000;
const MAX_SEND_ATTEMPTS = 3;
// 409 can hold the idempotency key while the in-flight send settles.
const MAX_CONFLICT_WAITS = 3;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// 429 and 409 honor Retry-After capped at 5s; everything else waits 1s.
const retryDelayMs = (response: Response): number => {
	if (response.status !== 429 && response.status !== 409) {
		return 1000;
	}
	const retryAfter = Number(response.headers.get("retry-after"));
	return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 1000;
};

export type ListedMessage = v.InferOutput<typeof listedMessageSchema>["messages"] extends
	| Array<infer M>
	| undefined
	? M
	: never;

export const listMessages = async (
	env: Env,
	conversationId: string,
	accountId: string,
	limit = 100,
	signal?: AbortSignal,
): Promise<Array<ListedMessage>> => {
	const url =
		`${zernioBaseUrl(env)}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages` +
		`?accountId=${encodeURIComponent(accountId)}&sortOrder=desc&limit=${limit}`;
	const response = await fetch(url, {
		headers: { authorization: `Bearer ${env.ZERNIO_API_KEY}` },
		signal: signal ?? AbortSignal.timeout(SEND_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`Zernio list messages failed: ${response.status}`);
	}
	const parsed = v.safeParse(listedMessageSchema, await response.json().catch(() => undefined));
	return parsed.success ? (parsed.output.messages ?? []) : [];
};

// Does this listed outgoing message carry the same content we tried to send?
// Text compares exactly; a template send has no `message` string, so match an
// attachment payload/subject on the first element title.
const matchesSend = (listed: ListedMessage, body: ZernioSendBody): boolean => {
	if (body.message !== undefined) {
		return listed.message === body.message;
	}
	const title = body.template?.elements[0]?.title;
	if (title === undefined) {
		return false;
	}
	return (listed.attachments ?? []).some(
		(a) => a.payload?.includes(title) === true || a.subject?.includes(title) === true,
	);
};

// Idempotency-Key only replays 2xx at Zernio: after a 5xx or network failure
// the key is released, so a blind retry can double-send. List the recent
// conversation messages first; an outgoing one created at/after the first
// attempt with matching content means the original send landed.
const wasDelivered = async (
	env: Env,
	conversationId: string,
	body: ZernioSendBody,
	firstAttemptAt: number,
): Promise<{ found: boolean; id: string | null }> => {
	try {
		const url =
			`${zernioBaseUrl(env)}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages` +
			`?accountId=${encodeURIComponent(body.accountId)}&sortOrder=desc&limit=20`;
		const response = await fetch(url, {
			headers: { authorization: `Bearer ${env.ZERNIO_API_KEY}` },
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
		});
		if (!response.ok) {
			return { found: false, id: null };
		}
		const parsed = v.safeParse(listedMessageSchema, await response.json().catch(() => undefined));
		if (!parsed.success) {
			return { found: false, id: null };
		}
		const match = (parsed.output.messages ?? []).find(
			(m) =>
				m.direction === "outgoing" &&
				m.createdAt !== undefined &&
				Date.parse(m.createdAt) >= firstAttemptAt - RECONCILE_SKEW_MS &&
				matchesSend(m, body),
		);
		return { found: match !== undefined, id: match?.id ?? null };
	} catch {
		return { found: false, id: null };
	}
};

// One POST attempt, classified. "reconcile" means the request may have landed
// (5xx or network failure release the idempotency key): check the recent
// messages list before retrying.
type SendAttempt =
	| { error: unknown; kind: "reconcile" }
	| { delayMs: number; errorText: string; kind: "conflict" | "ratelimit"; status: number }
	| { errorText: string; kind: "other"; status: number }
	| { errorText: string; kind: "reconcile"; status: number }
	| { kind: "ok"; messageId: string | null };

const attemptSend = async (
	env: Env,
	url: string,
	body: ZernioSendBody,
	key: string,
): Promise<SendAttempt> => {
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
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
		});
	} catch (error) {
		return { error, kind: "reconcile" };
	}
	if (response.ok) {
		const parsed = v.safeParse(sendResponseSchema, await response.json().catch(() => undefined));
		return {
			kind: "ok",
			messageId: parsed.success ? (parsed.output.data?.messageId ?? null) : null,
		};
	}
	const errorText = await response.text();
	const status = response.status;
	if (status === 409) {
		return { delayMs: retryDelayMs(response), errorText, kind: "conflict", status };
	}
	if (status === 429) {
		return { delayMs: retryDelayMs(response), errorText, kind: "ratelimit", status };
	}
	if (status >= 500) {
		return { errorText, kind: "reconcile", status };
	}
	return { errorText, kind: "other", status };
};

// The single outbound choke point. The caller generates `key` once per logical
// send part (e.g. `${turnId}:text`) and it is reused across retries, so a
// slow-but-delivered send can't double-post. On network error, timeout or 5xx
// the recent-messages list is checked for the send before retrying. A 409
// means the key's earlier send is still in flight: wait Retry-After and ask
// again. 429 retries while attempts remain. Other 4xx throw. Returns the
// Zernio messageId, or null when the response doesn't carry one.
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
	const firstAttemptAt = Date.now();
	const reconcile = async (): Promise<string | null | undefined> => {
		const delivered = await wasDelivered(env, conversationId, body, firstAttemptAt);
		return delivered.found ? delivered.id : undefined;
	};

	let status = 0;
	let errorText = "";
	let conflicts = 0;
	for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
		const last = attempt === MAX_SEND_ATTEMPTS - 1;
		const r = await attemptSend(env, url, body, key);
		if (r.kind === "ok") {
			return r.messageId;
		}
		if (r.kind === "conflict") {
			if (conflicts++ < MAX_CONFLICT_WAITS) {
				attempt -= 1;
				await sleep(r.delayMs);
				continue;
			}
			status = r.status;
			errorText = r.errorText;
			break;
		}
		if (r.kind === "ratelimit") {
			status = r.status;
			errorText = r.errorText;
			if (!last) {
				await sleep(r.delayMs);
				continue;
			}
			break;
		}
		if (r.kind === "reconcile") {
			const delivered = await reconcile();
			if (delivered !== undefined) {
				return delivered;
			}
			if ("error" in r) {
				if (last) {
					throw r.error;
				}
				await sleep(1000);
				continue;
			}
			status = r.status;
			errorText = r.errorText;
			if (!last) {
				await sleep(1000);
				continue;
			}
			break;
		}
		status = r.status;
		errorText = r.errorText;
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
