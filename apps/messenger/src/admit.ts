import * as v from "valibot";
import { accountIds } from "./env";
import type { Env } from "./env";

// Events older than this are dropped: Zernio retries a failed webhook inside a
// short window, so anything older is a replay of a turn we already finished or
// abandoned.
const STALE_EVENT_WINDOW_MS = 3 * 60_000;

// ─── Inbound event shape (valibot: only the fields we read) ──────────────────

const referralSchema = v.looseObject({
	ad_id: v.optional(v.string()),
	ref: v.optional(v.string()),
	source: v.optional(v.string()),
});

export const zernioMessageEventSchema = v.looseObject({
	// Event UUID, identical on every retry: our dedupe key.
	account: v.looseObject({
		accountId: v.optional(v.string()),
		id: v.pipe(v.string(), v.minLength(1)),
	}),
	conversation: v.looseObject({
		id: v.pipe(v.string(), v.minLength(1)),
		platformConversationId: v.optional(v.string()),
	}),
	event: v.literal("message.received"),
	id: v.pipe(v.string(), v.minLength(1)),
	message: v.looseObject({
		attachments: v.optional(
			v.array(
				v.looseObject({
					type: v.string(),
					url: v.optional(v.nullable(v.string())),
				}),
			),
		),
		conversationId: v.optional(v.string()),
		direction: v.string(),
		id: v.optional(v.string()),
		platform: v.string(),
		platformMessageId: v.optional(v.string()),
		sender: v.optional(v.looseObject({ id: v.string() })),
		sentAt: v.optional(v.string()),
		text: v.nullable(v.string()),
	}),
	timestamp: v.string(),
	// Postback taps and quick-reply taps arrive as message.received carrying
	// these payload fields; strings come back exactly as we sent them.
	metadata: v.nullish(
		v.looseObject({
			postbackPayload: v.optional(v.string()),
			quickReplyPayload: v.optional(v.string()),
			referral: v.optional(referralSchema),
		}),
	),
});

export type ZernioMessageEvent = v.InferOutput<typeof zernioMessageEventSchema>;

const envelopeSchema = v.looseObject({ event: v.optional(v.string()) });

// ─── Signature verification ─────────────────────────────────────────────────

const hexToBytes = (hex: string): Uint8Array | undefined => {
	if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
		return undefined;
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	}
	return bytes;
};

const hmacKeys = new Map<string, Promise<CryptoKey>>();
const hmacKey = (secret: string): Promise<CryptoKey> => {
	let key = hmacKeys.get(secret);
	if (key === undefined) {
		key = crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ hash: "SHA-256", name: "HMAC" },
			false,
			["verify"],
		);
		hmacKeys.set(secret, key);
	}
	return key;
};

const verifySignature = async (
	rawBody: string,
	header: string | undefined,
	secret: string,
): Promise<boolean> => {
	if (!header) {
		return false;
	}
	const hex = header.startsWith("sha256=") ? header.slice(7) : header;
	const signature = hexToBytes(hex);
	if (signature === undefined) {
		return false;
	}
	try {
		return await crypto.subtle.verify(
			"HMAC",
			await hmacKey(secret),
			signature,
			new TextEncoder().encode(rawBody),
		);
	} catch {
		return false;
	}
};

// ─── Admission ───────────────────────────────────────────────────────────────

export type Admission =
	| {
			conversationId: string;
			event: ZernioMessageEvent;
			ok: true;
			threadId: string;
	  }
	| { ok: false; response: Response };

// Admission runs BEFORE Chat SDK: signature gate first, then the event filter,
// so a rejected event never reaches the adapter or the DOs.
export const admit = async (request: Request, env: Env, rawBody: string): Promise<Admission> => {
	const signatureOk = await verifySignature(
		rawBody,
		request.headers.get("x-zernio-signature") ?? undefined,
		env.ZERNIO_WEBHOOK_SECRET,
	);
	if (!signatureOk) {
		return { ok: false, response: new Response("invalid signature", { status: 401 }) };
	}

	let payload: unknown;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}
	const envelope = v.safeParse(envelopeSchema, payload);
	if (!envelope.success || envelope.output.event !== "message.received") {
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}
	const parsed = v.safeParse(zernioMessageEventSchema, payload);
	if (!parsed.success) {
		console.error("[zernio.unparsed]", parsed.issues);
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}
	const event = parsed.output;

	const allowed = accountIds(env);
	if (
		event.message.direction !== "incoming" ||
		event.message.platform !== "facebook" ||
		!allowed.includes(event.account.id)
	) {
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}

	const ageMs = Date.now() - Date.parse(event.timestamp);
	if (!Number.isFinite(ageMs) || ageMs > STALE_EVENT_WINDOW_MS) {
		console.log(`[zernio.stale] event=${event.id} timestamp=${event.timestamp}`);
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}

	// The adapter builds thread ids from account.id + message.conversationId
	// verbatim; a missing conversationId would route the turn to
	// "zernio:<acc>:undefined" and the reply would never land.
	const conversationId = event.message.conversationId;
	if (conversationId === undefined) {
		console.log(`[zernio.no_conversation_id] event=${event.id}`);
		return { ok: false, response: new Response("ok", { status: 200 }) };
	}
	const threadId = `zernio:${event.account.id}:${conversationId}`;
	return { conversationId, event, ok: true, threadId };
};
