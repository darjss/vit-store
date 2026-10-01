// Local Zernio capture server: records every request to
// /tmp/messenger-capture.jsonl (path, Idempotency-Key, JSON body) and answers
// the Zernio send/typing shape so the real send path runs end to end.
const LOG = "/tmp/messenger-capture.jsonl";
import { appendFile } from "node:fs/promises";

Bun.serve({
	async fetch(request) {
		const url = new URL(request.url);
		const body = await request.text();
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
		return Response.json({ data: { messageId: `cap_${crypto.randomUUID().slice(0, 8)}` } });
	},
	port: 8799,
});
console.log(`capture listening on http://127.0.0.1:8799 -> ${LOG}`);
