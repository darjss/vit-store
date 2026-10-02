// Local Zernio capture server: records every request to
// /tmp/messenger-capture.jsonl (path, Idempotency-Key, JSON body) and answers
// the Zernio send/typing shape so the real send path runs end to end.
// Sent messages are remembered per conversation so the reconcile GET on
// /v1/inbox/conversations/<id>/messages can find them after a failed send.
// CAPTURE_FAIL_ONCE=<substring>: the first POST whose body contains it is
// recorded (so reconcile can see it) but answered with 500.
const LOG = "/tmp/messenger-capture.jsonl";
import { appendFile } from "node:fs/promises";
import * as v from "valibot";

const failOnce = process.env.CAPTURE_FAIL_ONCE ?? "";
let failed = false;

type Sent = {
	conversationId: string;
	createdAt: string;
	direction: "incoming" | "outgoing";
	id: string;
	message?: string;
};
const sent = new Map<string, Array<Sent>>();

const messagesPath = /^\/api\/v1\/inbox\/conversations\/([^/]+)\/messages$/;
const sendSchema = v.looseObject({ message: v.optional(v.string()) });

const listMessages = (convoId: string): Response => {
	const messages = (sent.get(convoId) ?? [])
		.slice()
		.reverse()
		.map((m) => ({
			createdAt: m.createdAt,
			direction: m.direction,
			id: m.id,
			message: m.message,
		}));
	return Response.json({
		messages,
		pagination: { hasMore: false, nextCursor: null },
		sortOrderApplied: "desc",
		status: "ok",
	});
};

const recordSend = (convoId: string, body: string, messageId: string): void => {
	const parsed = v.safeParse(sendSchema, JSON.parse(body || "{}"));
	const list = sent.get(convoId) ?? [];
	list.push({
		conversationId: convoId,
		createdAt: new Date().toISOString(),
		direction: "outgoing",
		id: messageId,
		message: parsed.success ? parsed.output.message : undefined,
	});
	sent.set(convoId, list);
};

// Test hook: POST /__seed {conversationId, message} plants a prior incoming
// message that the conversation history GET returns.
const seedMessage = (body: string): Response => {
	const seed = v.safeParse(
		v.object({ conversationId: v.string(), message: v.string() }),
		JSON.parse(body || "{}"),
	);
	if (!seed.success) {
		return Response.json({ error: "bad_seed" }, { status: 400 });
	}
	const list = sent.get(seed.output.conversationId) ?? [];
	list.push({
		conversationId: seed.output.conversationId,
		createdAt: new Date(Date.now() - 60_000).toISOString(),
		direction: "incoming",
		id: `seed_${crypto.randomUUID().slice(0, 8)}`,
		message: seed.output.message,
	});
	sent.set(seed.output.conversationId, list);
	return Response.json({ ok: true });
};

const recordRequest = async (request: Request, url: URL, body: string): Promise<void> => {
	const record = {
		at: new Date().toISOString(),
		body: JSON.parse(body || "null"),
		idempotencyKey: request.headers.get("idempotency-key"),
		method: request.method,
		path: url.pathname,
	};
	await appendFile(LOG, `${JSON.stringify(record)}\n`).catch(() => undefined);
	console.log(`[capture] ${request.method} ${url.pathname}`);
};

const answerSend = (url: URL, body: string, convoId: string | null): Response => {
	const messageId = `cap_${crypto.randomUUID().slice(0, 8)}`;
	if (convoId !== null) {
		recordSend(convoId, body, messageId);
	}
	if (!failed && failOnce.length > 0 && body.includes(failOnce)) {
		failed = true;
		console.log(`[capture] injected 500 for ${url.pathname}`);
		return Response.json({ error: "injected" }, { status: 500 });
	}
	return Response.json({ data: { messageId } });
};

Bun.serve({
	async fetch(request) {
		const url = new URL(request.url);
		const body = await request.text();

		const convo = messagesPath.exec(url.pathname);
		if (request.method === "GET" && convo !== null) {
			return listMessages(decodeURIComponent(convo[1] ?? ""));
		}
		if (request.method === "POST" && url.pathname === "/__seed") {
			return seedMessage(body);
		}

		await recordRequest(request, url, body);
		// grammy expects { ok: true, result: ... } from <apiRoot>/bot<token>/<method>.
		if (url.pathname.startsWith("/bot")) {
			return Response.json({
				ok: true,
				result: { file_path: "file.jpg", message_id: 42 },
			});
		}
		const convoId =
			request.method === "POST" && convo !== null ? decodeURIComponent(convo[1] ?? "") : null;
		return answerSend(url, body, convoId);
	},
	port: 8799,
});
console.log(`capture listening on http://127.0.0.1:8799 -> ${LOG}`);
