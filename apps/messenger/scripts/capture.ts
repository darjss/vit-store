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
			direction: "outgoing",
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
		id: messageId,
		message: parsed.success ? parsed.output.message : undefined,
	});
	sent.set(convoId, list);
};

Bun.serve({
	async fetch(request) {
		const url = new URL(request.url);
		const body = await request.text();

		const convo = messagesPath.exec(url.pathname);
		if (request.method === "GET" && convo !== null) {
			return listMessages(decodeURIComponent(convo[1] ?? ""));
		}

		const record = {
			at: new Date().toISOString(),
			body: JSON.parse(body || "null"),
			idempotencyKey: request.headers.get("idempotency-key"),
			method: request.method,
			path: url.pathname,
		};
		await appendFile(LOG, `${JSON.stringify(record)}\n`).catch(() => undefined);
		console.log(`[capture] ${request.method} ${url.pathname}`);
		// grammy expects { ok: true, result: ... } from <apiRoot>/bot<token>/<method>.
		if (url.pathname.startsWith("/bot")) {
			return Response.json({
				ok: true,
				result: { file_path: "file.jpg", message_id: 42 },
			});
		}
		const messageId = `cap_${crypto.randomUUID().slice(0, 8)}`;
		if (request.method === "POST" && convo !== null) {
			recordSend(decodeURIComponent(convo[1] ?? ""), body, messageId);
		}
		if (!failed && failOnce.length > 0 && body.includes(failOnce)) {
			failed = true;
			console.log(`[capture] injected 500 for ${url.pathname}`);
			return Response.json({ error: "injected" }, { status: 500 });
		}
		return Response.json({ data: { messageId } });
	},
	port: 8799,
});
console.log(`capture listening on http://127.0.0.1:8799 -> ${LOG}`);
