/**
 * Interactive local Messenger development CLI.
 *
 * A small Messenger console for testing the customer assistant during
 * development. It drives the REAL local HTTP webhook path:
 *
 *   REPL text ─▶ Meta-shaped, HMAC-signed webhook POST
 *            ─▶ POST /channels/messenger/webhook  (real Flue route + signature
 *               check + admission shaping in apps/agent/src/channels/*)
 *            ─▶ assistant dispatch ─▶ post_messenger_message tool
 *            ─▶ Graph Send API (redirected by MESSENGER_GRAPH_BASE_URL)
 *            ─▶ this CLI's capture server ─▶ transcript + saved JSON
 *
 * Nothing here forks the webhook logic: the payload shape mirrors what Meta
 * sends and what apps/agent/src/channels/messenger-admission.ts already
 * consumes, and the worker verifies the signature exactly as in production.
 *
 * Run the worker first (`bun run dev`), then this CLI (`bun run dev:messenger`).
 */
import { createHmac } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	MessengerMessagingEvent,
	MessengerWebhookPayload,
} from "@flue/messenger";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEV_DIR = join(AGENT_ROOT, ".dev");
const SENT_DIR = join(DEV_DIR, "sent");
const STATE_FILE = join(DEV_DIR, "state.json");
// Private real-customer export. Read-only; never committed (gitignored).
const HISTORY_DIR = join(AGENT_ROOT, "..", "..", "messenger-chat-history");

// ─── Config (.dev.vars / env) ────────────────────────────────────────────────

function loadDotVars(file: string): Record<string, string> {
	if (!existsSync(file)) return {};
	const out: Record<string, string> = {};
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
	}
	return out;
}

const vars = { ...loadDotVars(join(AGENT_ROOT, ".dev.vars")), ...process.env };

function reqVar(name: string): string {
	const value = vars[name];
	if (!value) {
		console.error(
			`Missing ${name}. Set it in apps/agent/.dev.vars (see README).`,
		);
		process.exit(1);
	}
	return value;
}

const APP_SECRET = reqVar("MESSENGER_APP_SECRET");
const PAGE_ID = reqVar("MESSENGER_PAGE_ID");
const WORKER_URL = (
	vars.MESSENGER_DEV_WORKER_URL ?? "http://127.0.0.1:3583"
).replace(/\/$/, "");
const WEBHOOK_URL = `${WORKER_URL}/channels/messenger/webhook`;
const CAPTURE_PORT = Number(
	new URL(vars.MESSENGER_GRAPH_BASE_URL ?? "http://127.0.0.1:8788").port ||
		"8788",
);

// ─── Persistent state ────────────────────────────────────────────────────────

type Button = { title: string; kind: "postback" | "quick_reply" | "url"; value: string };
type Session = { psid: string };
type State = {
	current: string;
	sessions: Record<string, Session>;
	inboundSeq: number;
	lastButtons: Button[];
};

function freshPsid(name: string): string {
	// Stable-ish but unique per reset so each reset spawns a new agent session.
	return `DEV_PSID_${name}_${Date.now().toString(36)}`;
}

function loadState(): State {
	if (existsSync(STATE_FILE)) {
		try {
			return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
		} catch {
			// fall through to a fresh state on a corrupt file
		}
	}
	return {
		current: "default",
		sessions: { default: { psid: freshPsid("default") } },
		inboundSeq: 0,
		lastButtons: [],
	};
}

function saveState(state: State): void {
	mkdirSync(DEV_DIR, { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const state = loadState();
function psid(): string {
	const session = state.sessions[state.current];
	if (session) return session.psid;
	const created: Session = { psid: freshPsid(state.current) };
	state.sessions[state.current] = created;
	return created.psid;
}
function sessionId(): string {
	return `messenger:v1:page:${encodeURIComponent(PAGE_ID)}:page-scoped-id:${encodeURIComponent(psid())}`;
}

// ─── Terminal helpers ────────────────────────────────────────────────────────

const C = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

let rl: ReturnType<typeof createInterface>;
function printAbovePrompt(line: string): void {
	// Clear the current input line, print, then restore the prompt.
	process.stdout.write("\r\x1b[K");
	process.stdout.write(`${line}\n`);
	rl?.prompt(true);
}

// ─── Capture server (stands in for Graph Send API) ───────────────────────────

let outboundSeq = 0;

function extractButtons(message: Record<string, unknown>): Button[] {
	const buttons: Button[] = [];
	const quickReplies = message.quick_replies;
	if (Array.isArray(quickReplies)) {
		for (const qr of quickReplies) {
			if (qr && typeof qr === "object") {
				const title = String((qr as Record<string, unknown>).title ?? "");
				const payload = (qr as Record<string, unknown>).payload;
				if (typeof payload === "string")
					buttons.push({ title, kind: "quick_reply", value: payload });
			}
		}
	}
	const attachment = message.attachment as Record<string, unknown> | undefined;
	const payload = attachment?.payload as Record<string, unknown> | undefined;
	const collect = (btns: unknown) => {
		if (!Array.isArray(btns)) return;
		for (const b of btns) {
			if (!b || typeof b !== "object") continue;
			const btn = b as Record<string, unknown>;
			const title = String(btn.title ?? "");
			if (btn.type === "postback" && typeof btn.payload === "string")
				buttons.push({ title, kind: "postback", value: btn.payload });
			else if (btn.type === "web_url" && typeof btn.url === "string")
				buttons.push({ title, kind: "url", value: btn.url });
		}
	};
	if (payload) {
		collect(payload.buttons);
		if (Array.isArray(payload.elements))
			for (const el of payload.elements)
				if (el && typeof el === "object")
					collect((el as Record<string, unknown>).buttons);
	}
	return buttons;
}

// Smoke-mode signals, populated by the real webhook + capture path below.
let lastWebhookStatus = 0;
let lastBotReply: string | null = null;

function renderOutbound(body: Record<string, unknown>, savedPath: string): void {
	const message = body.message as Record<string, unknown> | undefined;
	if (body.sender_action) {
		printAbovePrompt(C.dim(`  · bot ${String(body.sender_action)}`));
		return;
	}
	if (!message) return;
	const buttons = extractButtons(message);
	if (typeof message.text === "string") {
		lastBotReply = message.text;
		printAbovePrompt(`${C.green("bot ›")} ${message.text}`);
	}
	const attachment = message.attachment as Record<string, unknown> | undefined;
	if (attachment) {
		const payload = attachment.payload as Record<string, unknown> | undefined;
		printAbovePrompt(
			C.dim(`  [attachment ${String(attachment.type)} ${String(payload?.template_type ?? "")}]`),
		);
	}
	if (buttons.length > 0) {
		state.lastButtons = buttons;
		saveState(state);
		buttons.forEach((b, i) =>
			printAbovePrompt(
				C.dim(`  [${i + 1}] ${b.title} (${b.kind}: ${b.value})`),
			),
		);
		printAbovePrompt(C.dim("  fire one with: /fire <n>"));
	}
	printAbovePrompt(C.dim(`  saved → ${savedPath.replace(`${AGENT_ROOT}/`, "")}`));
}

function startCaptureServer(): void {
	mkdirSync(SENT_DIR, { recursive: true });
	Bun.serve({
		port: CAPTURE_PORT,
		hostname: "127.0.0.1",
		async fetch(req) {
			const url = new URL(req.url);
			if (req.method !== "POST") {
				// e.g. profile GET — return an empty-ish profile so the SDK is happy.
				return Response.json({ id: psid() });
			}
			let body: Record<string, unknown> = {};
			try {
				body = (await req.json()) as Record<string, unknown>;
			} catch {
				// ignore non-JSON
			}
			const recipient = body.recipient as Record<string, unknown> | undefined;
			const recipientId =
				(recipient?.id as string | undefined) ?? psid();
			// Only persist real outbound messages (skip typing/mark_seen noise).
			if (!body.sender_action) {
				outboundSeq += 1;
				const file = join(
					SENT_DIR,
					`${String(outboundSeq).padStart(4, "0")}-${url.pathname.replace(/\W+/g, "_")}.json`,
				);
				writeFileSync(file, JSON.stringify(body, null, 2));
				renderOutbound(body, file);
			} else {
				renderOutbound(body, "");
			}
			return Response.json({
				recipient_id: recipientId,
				message_id: `dev-out-${Date.now().toString(36)}-${outboundSeq}`,
			});
		},
	});
}

// ─── Webhook sender (real signed HTTP path) ──────────────────────────────────

function buildPayload(event: MessengerMessagingEvent): MessengerWebhookPayload {
	return {
		object: "page",
		entry: [
			{
				id: PAGE_ID,
				time: Date.now(),
				messaging: [event],
			},
		],
	};
}

async function postWebhook(event: MessengerMessagingEvent): Promise<void> {
	const bodyText = JSON.stringify(buildPayload(event));
	const signature = createHmac("sha256", APP_SECRET)
		.update(bodyText)
		.digest("hex");
	let res: Response;
	try {
		res = await fetch(WEBHOOK_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-hub-signature-256": `sha256=${signature}`,
			},
			body: bodyText,
		});
	} catch (err) {
		lastWebhookStatus = 0;
		printAbovePrompt(
			C.red(
				`  ✗ could not reach worker at ${WEBHOOK_URL} — is \`bun run dev\` running?`,
			),
		);
		printAbovePrompt(C.dim(`  ${err instanceof Error ? err.message : String(err)}`));
		return;
	}
	lastWebhookStatus = res.status;
	if (!res.ok) {
		printAbovePrompt(
			C.red(`  ✗ webhook ${res.status} ${res.statusText}`),
		);
		return;
	}
	printAbovePrompt(C.dim(`  · webhook ${res.status} ${await res.text()}`));
}

function nextMid(): string {
	state.inboundSeq += 1;
	saveState(state);
	return `dev-mid-${state.inboundSeq}-${Date.now().toString(36)}`;
}

async function sendText(text: string): Promise<void> {
	printAbovePrompt(`${C.cyan("you ›")} ${text}`);
	await postWebhook({
		sender: { id: psid() },
		recipient: { id: PAGE_ID },
		timestamp: Date.now(),
		message: { mid: nextMid(), text },
	});
}

async function fireButton(index: number): Promise<void> {
	const button = state.lastButtons[index - 1];
	if (!button) {
		printAbovePrompt(C.red(`  ✗ no button #${index}. Try /buttons.`));
		return;
	}
	if (button.kind === "url") {
		printAbovePrompt(
			C.yellow(`  web_url button → would open ${button.value} (no webhook event)`),
		);
		return;
	}
	printAbovePrompt(
		`${C.cyan("you ›")} ${C.dim(`[tap "${button.title}" → ${button.kind} ${button.value}]`)}`,
	);
	if (button.kind === "quick_reply") {
		// Quick replies arrive as a normal message event carrying the payload —
		// exactly what admission reads via message.quick_reply.payload.
		await postWebhook({
			sender: { id: psid() },
			recipient: { id: PAGE_ID },
			timestamp: Date.now(),
			message: {
				mid: nextMid(),
				text: button.title,
				quick_reply: { payload: button.value },
			},
		});
		return;
	}
	// Postback button → native postback event on the same real webhook route.
	await postWebhook({
		sender: { id: psid() },
		recipient: { id: PAGE_ID },
		timestamp: Date.now(),
		postback: { mid: nextMid(), title: button.title, payload: button.value },
	});
}

// ─── Seed replay from private export ─────────────────────────────────────────

function listHistory(): string[] {
	if (!existsSync(HISTORY_DIR)) return [];
	return readdirSync(HISTORY_DIR).filter((f) => f.endsWith(".json"));
}

async function seed(arg: string | undefined): Promise<void> {
	if (!existsSync(HISTORY_DIR)) {
		printAbovePrompt(
			C.yellow(
				`  no private export at ${HISTORY_DIR} (messenger-chat-history/ is gitignored & optional)`,
			),
		);
		return;
	}
	const files = listHistory();
	if (!arg || arg === "list") {
		printAbovePrompt(C.dim("  seed examples:"));
		files.forEach((f) => printAbovePrompt(C.dim(`   - ${f}`)));
		printAbovePrompt(C.dim("  replay with: /seed <file>"));
		return;
	}
	const target = files.find((f) => f === arg || f === `${arg}.json`);
	if (!target) {
		printAbovePrompt(C.red(`  ✗ no example "${arg}" (see /seed list)`));
		return;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(join(HISTORY_DIR, target), "utf8"));
	} catch (err) {
		printAbovePrompt(C.red(`  ✗ could not parse ${target}: ${String(err)}`));
		return;
	}
	// Best-effort: pull human/customer text lines out of a few common shapes.
	const texts = extractSeedTexts(parsed);
	if (texts.length === 0) {
		printAbovePrompt(C.yellow(`  no replayable customer texts found in ${target}`));
		return;
	}
	printAbovePrompt(C.dim(`  replaying ${texts.length} message(s) from ${target}…`));
	for (const text of texts) {
		await sendText(text);
		await new Promise((r) => setTimeout(r, 400));
	}
}

function extractSeedTexts(data: unknown): string[] {
	const out: string[] = [];
	const visit = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		if (node && typeof node === "object") {
			const obj = node as Record<string, unknown>;
			const text =
				(typeof obj.content === "string" && obj.content) ||
				(typeof obj.text === "string" && obj.text) ||
				(typeof obj.message === "string" && obj.message) ||
				"";
			const sender = String(obj.from ?? obj.sender ?? obj.role ?? "").toLowerCase();
			const isCustomer =
				sender.includes("customer") ||
				sender.includes("user") ||
				sender.includes("human");
			if (text && (isCustomer || sender === "")) out.push(text);
			for (const value of Object.values(obj)) visit(value);
		}
	};
	visit(data);
	return out.slice(0, 25);
}

// ─── REPL ────────────────────────────────────────────────────────────────────

function banner(): void {
	console.log(C.bold("\n  Messenger dev console"));
	console.log(C.dim(`  worker   ${WEBHOOK_URL}`));
	console.log(C.dim(`  capture  http://127.0.0.1:${CAPTURE_PORT} (Graph Send API)`));
	console.log(C.dim(`  session  ${state.current}  psid=${psid()}`));
	console.log(C.dim(`  payloads ${SENT_DIR.replace(`${AGENT_ROOT}/`, "")}`));
	console.log(C.dim("  type a message, or /help for commands\n"));
}

function help(): void {
	for (const line of [
		"/help                 show this help",
		"/session [name]       list sessions, or switch/create one",
		"/reset                reset current session (new PSID → fresh bot memory)",
		"/psid                 show current session + PSID",
		"/buttons              list buttons from the last bot message",
		"/fire <n>             fire button n's payload (postback / quick reply)",
		"/payloads             list saved outgoing Send API JSON files",
		"/seed [list|<file>]   replay a private messenger-chat-history example",
		"/image                image input — placeholder until #20",
		"/quit                 exit",
	])
		printAbovePrompt(C.dim(`  ${line}`));
}

function listPayloads(): void {
	if (!existsSync(SENT_DIR)) {
		printAbovePrompt(C.dim("  (no payloads captured yet)"));
		return;
	}
	const files = readdirSync(SENT_DIR).sort();
	if (files.length === 0) {
		printAbovePrompt(C.dim("  (no payloads captured yet)"));
		return;
	}
	printAbovePrompt(C.dim(`  ${files.length} payload(s) in ${SENT_DIR.replace(`${AGENT_ROOT}/`, "")}:`));
	files.slice(-10).forEach((f) => printAbovePrompt(C.dim(`   - ${f}`)));
}

async function handleCommand(line: string): Promise<void> {
	const [cmd, ...rest] = line.slice(1).split(/\s+/);
	const arg = rest.join(" ").trim();
	switch (cmd) {
		case "help":
			help();
			return;
		case "quit":
		case "exit":
			process.exit(0);
			break;
		case "session": {
			if (!arg) {
				printAbovePrompt(C.dim("  sessions:"));
				for (const [name, s] of Object.entries(state.sessions))
					printAbovePrompt(
						C.dim(`   ${name === state.current ? "*" : " "} ${name}  psid=${s.psid}`),
					);
				printAbovePrompt(C.dim("  switch/create with: /session <name>"));
				return;
			}
			if (!state.sessions[arg]) state.sessions[arg] = { psid: freshPsid(arg) };
			state.current = arg;
			state.lastButtons = [];
			saveState(state);
			printAbovePrompt(C.dim(`  switched to session "${arg}" psid=${psid()}`));
			return;
		}
		case "reset": {
			state.sessions[state.current] = { psid: freshPsid(state.current) };
			state.lastButtons = [];
			saveState(state);
			printAbovePrompt(
				C.dim(`  reset session "${state.current}" → new psid=${psid()}`),
			);
			return;
		}
		case "psid":
			printAbovePrompt(C.dim(`  session=${state.current} psid=${psid()}`));
			printAbovePrompt(C.dim(`  sessionId=${sessionId()}`));
			return;
		case "buttons": {
			if (state.lastButtons.length === 0) {
				printAbovePrompt(C.dim("  (no buttons from the last bot message yet)"));
				return;
			}
			state.lastButtons.forEach((b, i) =>
				printAbovePrompt(C.dim(`  [${i + 1}] ${b.title} (${b.kind}: ${b.value})`)),
			);
			return;
		}
		case "fire": {
			const n = Number(arg);
			if (!Number.isInteger(n) || n < 1) {
				printAbovePrompt(C.red("  usage: /fire <button number>"));
				return;
			}
			await fireButton(n);
			return;
		}
		case "payloads":
			listPayloads();
			return;
		case "seed":
			await seed(arg || undefined);
			return;
		case "image":
			printAbovePrompt(
				C.yellow(
					"  image input is a placeholder until #20 (photo identification) lands.",
				),
			);
			printAbovePrompt(
				C.dim("  TODO(#20): attach an image → R2 key → message.attachments[]."),
			);
			return;
		default:
			printAbovePrompt(C.red(`  unknown command /${cmd} (try /help)`));
	}
}

// Non-interactive smoke test: drives the SAME real signed path as the REPL
// (one canned text turn) and asserts the agent dispatched and replied. Used by
// `bun run smoke` so any agent/reviewer can verify after adding a feature.
// SMOKE_EXPECT_REPLY=0 skips the bot-reply assertion (e.g. no Workers AI / --local).
async function runSmoke(): Promise<void> {
	const expectReply = process.env.SMOKE_EXPECT_REPLY !== "0";
	const replyTimeoutMs = Number(process.env.SMOKE_REPLY_TIMEOUT_MS ?? "45000");
	const checks: { name: string; ok: boolean; detail: string }[] = [];
	startCaptureServer();
	console.log(`\n  Messenger agent smoke (worker ${WEBHOOK_URL})\n`);

	// Fresh session so the turn is clean.
	state.sessions[state.current] = { psid: freshPsid(state.current) };
	saveState(state);

	await sendText("Сайн байна уу");
	checks.push({
		name: "signed text dispatches (no 500)",
		ok: lastWebhookStatus === 200,
		detail: `webhook → ${lastWebhookStatus || "unreachable"}`,
	});

	if (expectReply) {
		const deadline = Date.now() + replyTimeoutMs;
		while (Date.now() < deadline && lastBotReply === null) await Bun.sleep(500);
		checks.push({
			name: "bot reply received",
			ok: lastBotReply !== null,
			detail: lastBotReply ? `bot › ${lastBotReply.slice(0, 60)}…` : "no reply in time",
		});
	}

	console.log("");
	for (const c of checks) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name} — ${c.detail}`);
	const failed = checks.some((c) => !c.ok);
	console.log(`\n  ${failed ? "✗ SMOKE FAILED" : "✓ SMOKE PASSED"}\n`);
	process.exit(failed ? 1 : 0);
}

function main(): void {
	if (process.argv.includes("--smoke")) {
		void runSmoke();
		return;
	}
	startCaptureServer();
	banner();
	rl = createInterface({ input: process.stdin, output: process.stdout });
	rl.setPrompt(`${C.cyan(`[${state.current}]`)} › `);
	rl.prompt();
	rl.on("line", (raw) => {
		const line = raw.trim();
		const done = () => rl.prompt();
		if (line.length === 0) return done();
		const work = line.startsWith("/")
			? handleCommand(line)
			: sendText(line);
		work.finally(done);
	});
	rl.on("close", () => {
		console.log(C.dim("\n  bye"));
		process.exit(0);
	});
}

main();
