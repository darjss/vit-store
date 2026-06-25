/**
 * Remote probe: drive the DEPLOYED Messenger agent as if a real customer.
 *
 * Sends a real Meta-shaped, HMAC-signed webhook event to the deployed worker
 * (so it goes through production's exact signature check + admission + dispatch),
 * then reads the bot's reply back from the Graph conversations API. Lets an
 * agent/operator test the live bot end-to-end from the terminal without typing
 * in Messenger.
 *
 *   bun run probe -- "sain uu"                    # text turn
 *   bun run probe -- --postback "order_product:6993"   # button tap
 *   bun run probe -- --psid 123... "vitamin"      # override the sender PSID
 *
 * Env (apps/agent/.dev.vars or process env):
 *   MESSENGER_APP_SECRET     sign the webhook exactly as Meta does
 *   MESSENGER_ACCESS_TOKEN   page token to READ the conversation back
 *   MESSENGER_PAGE_ID        page id
 *   MESSENGER_TEST_PSID      sender PSID (a real, messageable PSID — the bot
 *                            replies to it, so use your own or a tester's)
 *   MESSENGER_PROBE_URL      deployed webhook (default agent.amerikvitamin.mn)
 *
 * NOTE: replies land in that PSID's real Messenger thread, and a full checkout
 * would create a REAL order. Use for conversation testing.
 */
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotVars(file: string): Record<string, string> {
	if (!existsSync(file)) return {};
	const out: Record<string, string> = {};
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const t = line.trim();
		if (!t || t.startsWith("#")) continue;
		const eq = t.indexOf("=");
		if (eq > 0) out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
	}
	return out;
}

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

const APP_SECRET = req("MESSENGER_APP_SECRET");
const PAGE_TOKEN = req("MESSENGER_ACCESS_TOKEN");
const PAGE_ID = req("MESSENGER_PAGE_ID");
const PSID = vars.MESSENGER_TEST_PSID ?? "";
const WORKER = (vars.MESSENGER_PROBE_URL ?? "https://agent.amerikvitamin.mn").replace(/\/$/, "");
const WEBHOOK = `${WORKER}/channels/messenger/webhook`;
const GRAPH = "https://graph.facebook.com/v23.0";

// ─── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let psid = PSID;
let postback: string | undefined;
const words: string[] = [];
for (let i = 0; i < argv.length; i++) {
	if (argv[i] === "--psid") psid = argv[++i] ?? psid;
	else if (argv[i] === "--postback") postback = argv[++i];
	else words.push(argv[i]!);
}
const text = words.join(" ");
if (!psid) {
	console.error("No PSID. Pass --psid <id> or set MESSENGER_TEST_PSID.");
	process.exit(1);
}
if (!text && !postback) {
	console.error('Nothing to send. Give a message or --postback "<payload>".');
	process.exit(1);
}

// ─── send a real signed Meta webhook to the deployed worker ──────────────────
const mid = `probe-${Date.now().toString(36)}`;
const messaging = postback
	? { sender: { id: psid }, recipient: { id: PAGE_ID }, timestamp: Date.now(), postback: { mid, title: "(probe)", payload: postback } }
	: { sender: { id: psid }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid, text } };
const body = JSON.stringify({ object: "page", entry: [{ id: PAGE_ID, time: Date.now(), messaging: [messaging] }] });
const sig = `sha256=${createHmac("sha256", APP_SECRET).update(body).digest("hex")}`;

const sentAt = Math.floor(Date.now() / 1000);
console.log(`\nyou › ${postback ? `[postback ${postback}]` : text}   (psid=${psid})`);
const res = await fetch(WEBHOOK, {
	method: "POST",
	headers: { "content-type": "application/json", "x-hub-signature-256": sig },
	body,
});
console.log(`  · webhook ${res.status} ${(await res.text()).trim()}`);
if (!res.ok) process.exit(1);

// ─── read the bot's reply back from the Graph conversations API ──────────────
async function readReplies(sinceUnix: number): Promise<{ time: string; text: string }[]> {
	const url = `${GRAPH}/${PAGE_ID}/conversations?platform=messenger&fields=messages.limit(8)%7Bmessage,from,created_time%7D&limit=5&access_token=${PAGE_TOKEN}`;
	const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
	const d: any = await r.json();
	if (d.error) throw new Error(d.error.message);
	const out: { time: string; text: string }[] = [];
	for (const conv of d.data ?? []) {
		for (const m of conv.messages?.data ?? []) {
			const t = Math.floor(new Date(m.created_time).getTime() / 1000);
			const fromPage = m.from?.id === PAGE_ID;
			if (fromPage && t >= sinceUnix && m.message) out.push({ time: m.created_time, text: m.message });
		}
	}
	return out.sort((a, b) => a.time.localeCompare(b.time));
}

console.log("  … waiting for bot reply (Kimi ~10-30s)");
const deadline = Date.now() + 50_000;
const seen = new Set<string>();
let got = 0;
while (Date.now() < deadline) {
	await Bun.sleep(3000);
	let replies: { time: string; text: string }[] = [];
	try {
		replies = await readReplies(sentAt);
	} catch (e) {
		console.error("  read error:", e instanceof Error ? e.message : String(e));
		break;
	}
	for (const r of replies) {
		const k = `${r.time}:${r.text.slice(0, 24)}`;
		if (seen.has(k)) continue;
		seen.add(k);
		got++;
		console.log(`bot › ${r.text}`);
	}
	if (got > 0 && Date.now() > deadline - 35_000) break; // got something, brief grace then stop
}
if (got === 0) console.log("  (no bot reply seen in time — check `wrangler tail`)");
console.log("");
