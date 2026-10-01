/**
 * Remote probe: drive the DEPLOYED Messenger agent as if a real customer.
 *
 * Sends a real Zernio-shaped, HMAC-signed webhook event to the deployed worker
 * (so it goes through production's exact signature check + admission + dispatch),
 * then reads the bot's reply back from the Zernio inbox API. Lets an
 * agent/operator test the live bot end-to-end from the terminal without typing
 * in Messenger.
 *
 *   bun run probe -- "sain uu"                          # text turn
 *   bun run probe -- --postback "order_product:6993"    # button tap
 *   bun run probe -- --conversation <id> "vitamin"      # override the conversation
 *
 * Env (apps/agent/.dev.vars or process env):
 *   ZERNIO_WEBHOOK_SECRET        sign the webhook exactly as Zernio does
 *   ZERNIO_API_KEY               inbox API key to READ the conversation back
 *   ZERNIO_ACCOUNT_ID            connected account id
 *   ZERNIO_CONVERSATION_ID       conversation to write into (a real thread —
 *                                the bot replies to it, so use a tester's)
 *   MESSENGER_PROBE_URL          deployed webhook (default agent.amerikvitamin.mn)
 *   ZERNIO_BASE_URL              API base for the read-back (default prod)
 *
 * NOTE: replies land in that conversation's real Messenger thread, and a full
 * checkout would create a REAL order. Use for conversation testing.
 */
import { createHmac, randomUUID } from "node:crypto";
import { join } from "node:path";
import { array, object, optional, parse, string } from "valibot";
import { loadDotVars } from "./dot-vars";
import { buildZernioInboundEvent } from "./zernio-send";

const AGENT_ROOT = join(import.meta.dirname, "..");

const vars = {
	...loadDotVars(join(AGENT_ROOT, "../../.env")),
	...loadDotVars(join(AGENT_ROOT, ".dev.vars")),
	...loadDotVars(join(AGENT_ROOT, ".probe.vars")),
	...process.env,
};
const req = (n: string): string => {
	const v = vars[n];
	if (!v) {
		console.error(`Missing ${n} (set in apps/agent/.dev.vars or env).`);
		process.exit(1);
	}
	return v;
};

const WEBHOOK_SECRET = req("ZERNIO_WEBHOOK_SECRET");
const API_KEY = req("ZERNIO_API_KEY");
const ACCOUNT_ID = req("ZERNIO_ACCOUNT_ID");
const WORKER = (vars.MESSENGER_PROBE_URL ?? "https://agent.amerikvitamin.mn").replace(/\/$/, "");
const WEBHOOK = `${WORKER}/channels/messenger/webhook`;
const API_BASE = (vars.ZERNIO_BASE_URL ?? "https://zernio.com/api").replace(/\/+$/, "");

// ─── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let conversationId = vars.ZERNIO_CONVERSATION_ID ?? "";
let postback: string | undefined;
// --send-only: POST the signed webhook and exit WITHOUT reading the
// conversation back; read the bot's replies from the worker log ([bot.say] in
// `wrangler tail`) instead.
let sendOnly = false;
const words: Array<string> = [];
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === "--conversation") {
		conversationId = argv[++i] ?? conversationId;
	} else if (argv[i] === "--postback") {
		postback = argv[++i];
	} else if (argv[i] === "--send-only") {
		sendOnly = true;
	} else {
		words.push(argv[i]!);
	}
}
const text = words.join(" ");
if (!conversationId) {
	console.error("No conversation. Pass --conversation <id> or set ZERNIO_CONVERSATION_ID.");
	process.exit(1);
}
if (!text && !postback) {
	console.error('Nothing to send. Give a message or --postback "<payload>".');
	process.exit(1);
}

// ─── send a real signed Zernio webhook to the deployed worker ────────────────
const event = buildZernioInboundEvent({
	accountId: ACCOUNT_ID,
	conversationId,
	eventId: `probe-${randomUUID()}`,
	metadata: postback ? { postbackPayload: postback } : undefined,
	text: text || undefined,
});
const body = JSON.stringify(event);
const sig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

console.log(
	`\nyou › ${postback ? `[postback ${postback}]` : text}   (conversation=${conversationId})`,
);
const res = await fetch(WEBHOOK, {
	body,
	headers: { "content-type": "application/json", "x-zernio-signature": sig },
	method: "POST",
});
console.log(`  · webhook ${res.status} ${(await res.text()).trim()}`);
if (!res.ok) {
	process.exit(1);
}
if (sendOnly) {
	console.log("  (send-only — read the reply from `wrangler tail` [bot.say])\n");
	process.exit(0);
}

const zernioMessageSchema = object({
	createdAt: optional(string()),
	direction: optional(string()),
	sentAt: optional(string()),
	text: optional(string()),
});

const zernioMessagesResponseSchema = object({
	messages: optional(array(zernioMessageSchema)),
});

// ─── read the bot's reply back from the Zernio inbox API ─────────────────────
async function readReplies(sinceIso: string): Promise<Array<{ text: string; time: string }>> {
	const url = `${API_BASE}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`;
	const r = await fetch(url, {
		headers: { authorization: `Bearer ${API_KEY}` },
		signal: AbortSignal.timeout(15_000),
	});
	if (!r.ok) {
		throw new Error(`Zernio ${r.status} ${await r.text()}`);
	}
	const parsed = parse(zernioMessagesResponseSchema, await r.json());
	const since = Date.parse(sinceIso);
	const out: Array<{ text: string; time: string }> = [];
	for (const m of parsed.messages ?? []) {
		const time = m.sentAt ?? m.createdAt ?? "";
		if (m.direction === "outgoing" && m.text && Date.parse(time) >= since) {
			out.push({ text: m.text, time });
		}
	}
	return out.sort((a, b) => a.time.localeCompare(b.time));
}

console.log("  … waiting for bot reply (the model can take 30-60s for search/advice)");
const deadline = Date.now() + 95_000;
const seen = new Set<string>();
let got = 0;
let lastReplyAt = 0;
while (Date.now() < deadline) {
	await Bun.sleep(3000);
	let replies: Array<{ text: string; time: string }> = [];
	try {
		replies = await readReplies(event.timestamp);
	} catch (error) {
		console.error("  read error:", error instanceof Error ? error.message : String(error));
		break;
	}
	for (const r of replies) {
		const k = `${r.time}:${r.text.slice(0, 24)}`;
		if (seen.has(k)) {
			continue;
		}
		seen.add(k);
		got++;
		lastReplyAt = Date.now();
		console.log(`bot › ${r.text}`);
	}
	// Once a reply lands, wait ~10s more for follow-up messages, then stop.
	if (got > 0 && Date.now() - lastReplyAt > 10_000) {
		break;
	}
}
if (got === 0) {
	console.log("  (no text reply seen in time — may be product cards only; check `wrangler tail`)");
}
console.log("");
