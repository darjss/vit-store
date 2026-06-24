/**
 * Messenger export REGRESSION / REVIEW harness (#27 — last child of #16).
 *
 * A manual/agent review harness: it replays SELECTED, REAL customer messages
 * from the private Messenger export (`messenger-chat-history/`) through the SAME
 * real assistant/tool path the production worker uses, and prints a readable
 * transcript so a human or agent can eyeball the behaviour across every slice
 * the epic shipped:
 *
 *   slice                     issue   what this harness drives
 *   ───────────────────────   ─────   ───────────────────────────────────────
 *   text product lookup       #19     real signed webhook → search_products → cards
 *   product advice            #22     real signed webhook → get_product_advice → reply
 *   cart buttons              #21     real signed webhook → CartStore DO → summary
 *   payment buttons           #25     real @vit/assistant payment domain + handlers
 *   photo lookup              #20     NOTED as a split (needs vision; see photo:proof)
 *
 * NOTHING here re-implements assistant logic. The text + cart slices drive the
 * REAL HMAC-signed webhook on the running worker (same route + signature check +
 * admission shaping + dispatch as production); the payment slice drives the REAL
 * payment builders/handlers from `@vit/assistant` + `src/channels`. The only
 * stand-ins are the upstream store catalog/order API (a fixture server, exactly
 * as cli/advice.ts and scripts/cart-demo.ts do) and Meta's Graph Send API (a
 * capture server). The MODEL is NOT stubbed on the text slices — it is the real
 * Kimi assistant via env.AI, so boot the worker with real Workers AI.
 *
 *   real export message (selected)
 *     ─▶ HMAC-signed webhook → real route + dispatch → real tools
 *        ─▶ catalog fixture (stands in for the store API)
 *        ─▶ Graph Send API capture (stands in for Meta)
 *     ─▶ readable transcript printed here
 *
 * PRIVATE DATA: the export is read-only and never committed. This harness only
 * prints the customer TEXT it replays (redacted: names/PSIDs are never shown),
 * to stdout. It never writes the export, derived payloads, or output to disk.
 *
 * Usage (booted with the worker; gets real Workers AI for the model turns):
 *   bun run export:replay              live model proof (needs real Workers AI)
 *   bun run export:replay:local        --local: no model; selection + cart +
 *                                      payment slices, text slice noted as split
 *
 * Override the export location (it lives outside this gitignored worktree):
 *   MESSENGER_EXPORT_DIR=/abs/path/to/messenger-chat-history bun run export:replay
 */
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildPaymentChoice,
	buildQpayPageUrl,
	chooseTransferPayload,
	claimTransferPayload,
	isTransferDoneText,
	parseChooseTransferPayload,
	parseClaimTransferPayload,
	type PaymentRef,
	TRANSFER_CLAIM_ACK_MESSAGE,
} from "@vit/assistant";
import { bankTransfer } from "@vit/shared/constants";
import { SuperJSON } from "superjson";
import {
	handleChooseTransfer,
	handleTransferClaim,
	type PaymentHandlerDeps,
} from "../src/channels/payment-handler";
import { claimTransfer, fetchPaymentSummary } from "../src/lib/payment";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(AGENT_ROOT, "..", "..");
const FIXTURE_PORT = 8799; // must match STORE_API_URL in scripts/with-worker.ts
const CAPTURE_PORT = 8788; // must match MESSENGER_GRAPH_BASE_URL (Graph Send API)
const FIXTURE_BASE = `http://127.0.0.1:${FIXTURE_PORT}`;
const WORKER_URL = (
	process.env.MESSENGER_DEV_WORKER_URL ?? "http://127.0.0.1:3583"
).replace(/\/$/, "");
const WEBHOOK_URL = `${WORKER_URL}/channels/messenger/webhook`;

// Payment-domain lib calls run in THIS process; point them at the fixture too.
process.env.STORE_API_URL ??= FIXTURE_BASE;
process.env.STORE_PUBLIC_URL ??= FIXTURE_BASE;

const NO_MODEL = process.argv.includes("--no-model");

const C = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
	magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

// ─── .dev.vars (signature + ids, same as the dev console) ────────────────────

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
const APP_SECRET = vars.MESSENGER_APP_SECRET ?? "dev_local_secret";
const PAGE_ID = vars.MESSENGER_PAGE_ID ?? "DEV_PAGE_ID";

// ─── Export loader (Facebook/Meta inbox export shape) ────────────────────────
//
// The export is a Meta "Download your information" dump: messages/inbox/<thread>/
// message_1.json, each with { participants, messages:[{sender_name, content,
// photos?, timestamp_ms}] }. Text is double-encoded (UTF-8 bytes stored as
// Latin-1 — the classic FB "mojibake"); decodeFb() repairs it. The store page
// is one participant; every other participant is the customer.

const EXPORT_DIR =
	process.env.MESSENGER_EXPORT_DIR ?? join(REPO_ROOT, "messenger-chat-history");
const INBOX_DIR = join(EXPORT_DIR, "messages", "inbox");
const STORE_PARTICIPANT = process.env.MESSENGER_EXPORT_PAGE ?? "Amerik huns baraa";

function decodeFb(s: string): string {
	try {
		return Buffer.from(s, "latin1").toString("utf8");
	} catch {
		return s;
	}
}

interface ExportMsg {
	text: string;
	hasPhoto: boolean;
}

function loadCustomerMessages(limitThreads: number): ExportMsg[] {
	if (!existsSync(INBOX_DIR)) return [];
	const out: ExportMsg[] = [];
	const threads = readdirSync(INBOX_DIR).slice(0, limitThreads);
	for (const thread of threads) {
		const file = join(INBOX_DIR, thread, "message_1.json");
		if (!existsSync(file)) continue;
		let data: { messages?: Record<string, unknown>[] };
		try {
			data = JSON.parse(readFileSync(file, "utf8"));
		} catch {
			continue;
		}
		for (const m of data.messages ?? []) {
			if (m.sender_name === STORE_PARTICIPANT) continue; // skip the page side
			const raw = typeof m.content === "string" ? m.content : "";
			out.push({
				text: decodeFb(raw).trim(),
				hasPhoto: Array.isArray(m.photos),
			});
		}
	}
	return out;
}

// ─── Slice selection (the issue-specific part) ───────────────────────────────
//
// Pick REPRESENTATIVE real customer messages per slice with simple keyword
// buckets over the decoded text. Romanized + Cyrillic Mongolian both appear in
// the export, so each bucket carries both spellings.

interface Slice {
	key: string;
	label: string;
	match: (t: string) => boolean;
}

const SLICES: Slice[] = [
	{
		key: "product",
		label: "text product lookup (#19)",
		match: (t) =>
			/magnes|магни|omega|омега|vitamin|витамин|\bd-?3\b|глюкозамин|glucosamine|байгаа юу|байна уу|\bbga\b|\bbna\b|үнэ|\bune\b|хэд вэ/i.test(
				t,
			),
	},
	{
		key: "advice",
		label: "product advice (#22)",
		match: (t) =>
			/юунд сайн|сайн бэ|аль нь|ялгаа|яаж уу|яаж уух|хэрхэн|болох уу|уувал|уумаар|зөвлө|good for|which|recommend/i.test(
				t,
			),
	},
	{
		key: "cart",
		label: "cart intent (#21)",
		match: (t) =>
			/захиал|\bavya|\bavyaa|\bawya|\bav'?ya|order|сагс|худалдаж ав|авмаар/i.test(
				t,
			),
	},
	{
		key: "payment",
		label: "payment intent (#25)",
		match: (t) =>
			/данс|шилжүүл|qpay|төл|\btol\b|\btöl|данс(аа)?|шилжүүлэг|төлбөр|данс уу|дугаар/i.test(
				t,
			),
	},
];

function pickExamples(
	msgs: ExportMsg[],
	slice: Slice,
	n: number,
): string[] {
	const seen = new Set<string>();
	const picked: string[] = [];
	for (const m of msgs) {
		const t = m.text;
		if (t.length < 4 || t.length > 140) continue;
		if (!slice.match(t)) continue;
		const norm = t.toLowerCase();
		if (seen.has(norm)) continue;
		seen.add(norm);
		picked.push(t);
		if (picked.length >= n) break;
	}
	return picked;
}

// Redact: the harness only ever echoes the message TEXT (never names/PSIDs), and
// truncates long lines so a stray phone number can't sprawl into the transcript.
function redact(t: string): string {
	const oneLine = t.replace(/\s+/g, " ").trim();
	return oneLine.length > 110 ? `${oneLine.slice(0, 107)}…` : oneLine;
}

// ─── Catalog + payment fixture (stands in for the store API) ─────────────────
//
// Same projections cli/advice.ts and scripts/cart-demo.ts serve, in the one
// SuperJSON tRPC envelope the worker's lib/catalog.ts + lib/payment.ts expect.

type StockStatus = "in_stock" | "low_stock" | "out_of_stock";
const SEARCH_FIXTURE: {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stockStatus: StockStatus;
}[] = [
	{ id: 101, slug: "now-magnesium-glycinate-200", name: "NOW Foods Magnesium Glycinate 200mg", price: 89000, image: "https://example.com/maggly.jpg", brand: "NOW Foods", stockStatus: "in_stock" },
	{ id: 104, slug: "now-magnesium-citrate-400", name: "NOW Foods Magnesium Citrate 400mg", price: 72000, image: "https://example.com/magcit.jpg", brand: "NOW Foods", stockStatus: "in_stock" },
	{ id: 102, slug: "solgar-omega-3-950", name: "Solgar Omega-3 Fish Oil 950mg", price: 145000, image: "https://example.com/omega.jpg", brand: "Solgar", stockStatus: "low_stock" },
	{ id: 103, slug: "now-vitamin-d3-5000", name: "NOW Foods Vitamin D-3 5000 IU", price: 62000, image: "https://example.com/d3.jpg", brand: "NOW Foods", stockStatus: "in_stock" },
];

const ADVICE_FIXTURE: {
	id: number;
	name: string;
	brand: string;
	category: string;
	description: string;
	ingredients: string[];
	amount: string;
	potency: string;
	dailyIntake: number;
	price: number;
}[] = [
	{ id: 101, name: "NOW Foods Magnesium Glycinate 200mg", brand: "NOW Foods", category: "Эрдэс бодис", description: "Магни глицинат нь шингэц сайтай, ходоодонд зөөлөн магнийн хэлбэр. Булчингийн тайвшрал, нойрны чанар, өдөр тутмын тонусыг дэмжихэд түгээмэл сонгодог.", ingredients: ["Магни (бисглицинат хэлбэрээр) 200мг"], amount: "120 капсул", potency: "200мг", dailyIntake: 2, price: 89000 },
	{ id: 104, name: "NOW Foods Magnesium Citrate 400mg", brand: "NOW Foods", category: "Эрдэс бодис", description: "Магни цитрат нь өргөн хэрэглэгддэг, хямд магнийн хэлбэр. Шингэц сайтай бөгөөд гэдэсний хэвийн хөдөлгөөнийг дэмжихэд түгээмэл хэрэглэдэг.", ingredients: ["Магни (цитрат хэлбэрээр) 400мг"], amount: "100 шахмал", potency: "400мг", dailyIntake: 1, price: 72000 },
	{ id: 102, name: "Solgar Omega-3 Fish Oil 950mg", brand: "Solgar", category: "Тосны хүчил", description: "Загасны тосны омега-3 (EPA/DHA). Зүрх судас, тархи, нүдний эрүүл мэндийг дэмжихэд түгээмэл хэрэглэдэг.", ingredients: ["Загасны тос 1000мг", "EPA 600мг", "DHA 300мг"], amount: "100 капсул", potency: "950мг омега-3", dailyIntake: 1, price: 145000 },
	{ id: 103, name: "NOW Foods Vitamin D-3 5000 IU", brand: "NOW Foods", category: "Витамин", description: "Витамин D3 (холекальциферол) 5000 IU. Ясны эрүүл мэнд, дархлааг дэмжихэд түгээмэл хэрэглэдэг өндөр тунтай хэлбэр.", ingredients: ["Витамин D3 (холекальциферол) 5000 IU"], amount: "120 капсул", potency: "5000 IU", dailyIntake: 1, price: 62000 },
];

// The simulated order/payment record the payment-slice stub serves.
const PAYMENT = {
	paymentNumber: "PMT-7K2QX",
	checkoutToken: "ct_test_9f3ab21c",
	customerPhone: "99112233",
	total: 145_800,
	orderNumber: "ORD-5521",
	status: "pending" as "pending" | "customer_claimed_paid" | "success",
};
const paymentCalls = { confirmPayment: 0, confirmPaymentAndApplyStock: 0 };

function decodeInput(raw: string | null): { query?: string; limit?: number; ids?: number[] } | undefined {
	if (!raw) return undefined;
	try {
		return SuperJSON.deserialize(JSON.parse(raw)) as {
			query?: string;
			limit?: number;
			ids?: number[];
		};
	} catch {
		return undefined;
	}
}

function searchFixture(query: string, limit: number) {
	const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
	const matches = SEARCH_FIXTURE.filter((p) => {
		const hay = `${p.name} ${p.brand} ${p.slug}`.toLowerCase();
		const norm = hay
			.replace(/магни/g, "магни magnesium magni")
			.replace(/омега/g, "омега omega")
			.replace(/витамин d|d-3|d3/g, "vitamin d d3 d-3");
		return tokens.some((t) => norm.includes(t));
	});
	return (matches.length > 0 ? matches : SEARCH_FIXTURE).slice(0, limit);
}

function startFixtureServer() {
	const trpc = (data: unknown) =>
		new Response(
			JSON.stringify({ result: { data: SuperJSON.serialize(data) } }),
			{ headers: { "content-type": "application/json" } },
		);
	return Bun.serve({
		port: FIXTURE_PORT,
		hostname: "127.0.0.1",
		fetch(req) {
			const url = new URL(req.url);
			const path = url.pathname;
			const input = decodeInput(url.searchParams.get("input"));

			if (path.includes("getProductsByIdsForAdvice")) {
				const ids = input?.ids ?? [];
				return trpc(ids.map((id) => ADVICE_FIXTURE.find((p) => p.id === id)).filter(Boolean));
			}
			if (path.includes("getProductsByIdsForAssistant")) {
				const ids = input?.ids ?? [];
				return trpc(ids.map((id) => SEARCH_FIXTURE.find((p) => p.id === id)).filter(Boolean));
			}
			if (path.includes("searchProductsForAssistant")) {
				return trpc(searchFixture(input?.query ?? "", input?.limit ?? 8));
			}
			// Payment-slice procedures (lib/payment.ts hits these from THIS process).
			if (path.endsWith("/payment.getPaymentByNumber")) {
				return trpc({
					paymentNumber: PAYMENT.paymentNumber,
					status: PAYMENT.status,
					provider: "transfer",
					createdAt: "2026-06-25T00:00:00.000Z",
					total: PAYMENT.total,
					order: {
						orderNumber: PAYMENT.orderNumber,
						customerPhone: PAYMENT.customerPhone,
						status: "pending",
						address: "Баянзүрх дүүрэг",
						notes: "",
						createdAt: "2026-06-25T00:00:00.000Z",
						products: [],
					},
				});
			}
			if (path.endsWith("/payment.claimTransferPaid")) {
				if (PAYMENT.status === "pending") PAYMENT.status = "customer_claimed_paid";
				return trpc({ orderNumber: PAYMENT.orderNumber });
			}
			// Confirmation procedures must NEVER be hit on a claim (ADR-0004).
			if (path.endsWith("/payment.confirmPayment")) {
				paymentCalls.confirmPayment += 1;
				return trpc({ ok: true });
			}
			if (path.endsWith("/payment.confirmPaymentAndApplyStock")) {
				paymentCalls.confirmPaymentAndApplyStock += 1;
				return trpc({ ok: true });
			}
			return new Response("not found", { status: 404 });
		},
	});
}

// ─── Capture server (stands in for Graph Send API) ───────────────────────────

interface Captured {
	text?: string;
	attachment?: string;
	quickReplies: string[];
	buttons: string[];
}
// Append-only capture log tagged with the recipient PSID. The worker dispatches
// model turns asynchronously (waitUntil), so a slow reply from an earlier turn
// can land while a later turn is running; tagging by recipient lets each turn
// read back ONLY the sends addressed to its own session, with no cross-bleed.
const captures: { recipient: string; cap: Captured }[] = [];

function startCaptureServer() {
	return Bun.serve({
		port: CAPTURE_PORT,
		hostname: "127.0.0.1",
		async fetch(req) {
			if (req.method !== "POST") return Response.json({ id: PAGE_ID });
			let body: Record<string, unknown> = {};
			try {
				body = (await req.json()) as Record<string, unknown>;
			} catch {}
			if (!body.sender_action) {
				const message = (body.message ?? {}) as Record<string, unknown>;
				const recipient = (body.recipient ?? {}) as Record<string, unknown>;
				const qr = Array.isArray(message.quick_replies)
					? (message.quick_replies as Record<string, unknown>[]).map((q) => String(q.payload ?? ""))
					: [];
				const att = message.attachment as Record<string, unknown> | undefined;
				const payload = att?.payload as Record<string, unknown> | undefined;
				const btns: string[] = [];
				const collect = (b: unknown) => {
					if (!Array.isArray(b)) return;
					for (const x of b as Record<string, unknown>[]) {
						if (x.type === "postback" && typeof x.payload === "string") btns.push(`${x.title} → ${x.payload}`);
						else if (x.type === "web_url" && typeof x.url === "string") btns.push(`${x.title} → ${x.url}`);
					}
				};
				if (payload) {
					collect(payload.buttons);
					if (Array.isArray(payload.elements))
						for (const el of payload.elements as Record<string, unknown>[]) collect(el.buttons);
				}
				captures.push({
					recipient: String(recipient.id ?? ""),
					cap: {
						text: message.text as string | undefined,
						attachment: att ? `${String(att.type)} ${String(payload?.template_type ?? "")}` : undefined,
						quickReplies: qr,
						buttons: btns,
					},
				});
			}
			return Response.json({ recipient_id: String((body.recipient as Record<string, unknown>)?.id ?? PAGE_ID), message_id: `cap-${captures.length}` });
		},
	});
}

// ─── Signed webhook senders (the real HTTP path) ─────────────────────────────

let mid = 0;
function sign(bodyText: string): string {
	return createHmac("sha256", APP_SECRET).update(bodyText).digest("hex");
}
async function postWebhook(event: Record<string, unknown>): Promise<number> {
	const bodyText = JSON.stringify({
		object: "page",
		entry: [{ id: PAGE_ID, time: Date.now(), messaging: [event] }],
	});
	const res = await fetch(WEBHOOK_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-hub-signature-256": `sha256=${sign(bodyText)}`,
		},
		body: bodyText,
	});
	return res.status;
}
const sendText = (psid: string, text: string) =>
	postWebhook({ sender: { id: psid }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid: `m-${(mid += 1)}`, text } });
const firePostback = (psid: string, payload: string) =>
	postWebhook({ sender: { id: psid }, recipient: { id: PAGE_ID }, timestamp: Date.now(), postback: { mid: `m-${(mid += 1)}`, title: payload, payload } });
const fireQuickReply = (psid: string, payload: string) =>
	postWebhook({ sender: { id: psid }, recipient: { id: PAGE_ID }, timestamp: Date.now(), message: { mid: `m-${(mid += 1)}`, text: payload, quick_reply: { payload } } });

// Collect every send addressed to `psid` that lands after `sinceLen` (a cursor
// snapshotted BEFORE firing the event), settling once at least one has arrived
// and a quiet gap follows. Filtering by psid keeps a slow earlier-turn reply
// from being mis-attributed to this turn.
async function collectReplies(
	sinceLen: number,
	psid: string,
	timeoutMs: number,
	quietMs: number,
): Promise<Captured[]> {
	const deadline = Date.now() + timeoutMs;
	let lastSeen = 0;
	let lastAt = Date.now();
	const mine = () =>
		captures.slice(sinceLen).filter((c) => c.recipient === psid).map((c) => c.cap);
	while (Date.now() < deadline) {
		const count = mine().length;
		if (count > lastSeen) {
			lastSeen = count;
			lastAt = Date.now();
		}
		if (count > 0 && Date.now() - lastAt > quietMs) break;
		await Bun.sleep(300);
	}
	return mine();
}

function printCaptured(caps: Captured[]): void {
	if (caps.length === 0) {
		console.log(`    ${C.red("(no reply captured)")}`);
		return;
	}
	for (const c of caps) {
		if (c.text) console.log(`    ${C.green("bot ›")} ${redact(c.text)}`);
		if (c.attachment) console.log(`    ${C.dim(`[attachment ${c.attachment}]`)}`);
		for (const b of c.buttons) console.log(`    ${C.dim(`  [button] ${b}`)}`);
		if (c.quickReplies.length > 0) console.log(`    ${C.dim(`  [quick replies] ${c.quickReplies.join(", ")}`)}`);
	}
}

// ─── Slice runners ───────────────────────────────────────────────────────────

function hr(): void {
	console.log(C.dim("─".repeat(72)));
}

async function runTextSlice(label: string, examples: string[]): Promise<void> {
	hr();
	console.log(C.bold(`▶ ${label}`));
	if (examples.length === 0) {
		console.log(C.yellow("  (no representative export example matched this slice)"));
		return;
	}
	if (NO_MODEL) {
		console.log(C.yellow("  --no-model: selected real export inputs (model turn is the documented split):"));
		for (const ex of examples) console.log(`    ${C.cyan("you ›")} ${redact(ex)}`);
		return;
	}
	for (const ex of examples) {
		const psid = `DEV_PSID_replay_${mid}_${Math.floor(performance.now())}`;
		console.log(`  ${C.cyan("you ›")} ${redact(ex)}`);
		const since = captures.length;
		const status = await sendText(psid, ex);
		if (status !== 200) {
			console.log(`    ${C.red(`✗ webhook → ${status || "unreachable"}`)}`);
			continue;
		}
		printCaptured(await collectReplies(since, psid, 90_000, 4_000));
		console.log("");
	}
}

async function runCartSlice(anchor: string | undefined): Promise<void> {
	hr();
	console.log(C.bold("▶ cart buttons (#21) — real signed webhook → CartStore DO"));
	if (anchor) console.log(`  ${C.dim(`anchored on real export intent:`)} ${C.cyan(redact(anchor))}`);
	const psid = `DEV_PSID_cart_${Date.now().toString(36)}`;
	const steps: { label: string; fire: () => Promise<number> }[] = [
		{ label: 'tap "Захиалах" on Magnesium (order_product:101)', fire: () => firePostback(psid, "order_product:101") },
		{ label: "tap it again → qty merges (order_product:101)", fire: () => firePostback(psid, "order_product:101") },
		{ label: "add Omega-3 (order_product:102)", fire: () => firePostback(psid, "order_product:102") },
		{ label: "increment Omega-3 (cart_inc:102)", fire: () => fireQuickReply(psid, "cart_inc:102") },
		{ label: "remove Magnesium (cart_remove:101)", fire: () => fireQuickReply(psid, "cart_remove:101") },
		{ label: "confirm cart (cart_confirm)", fire: () => fireQuickReply(psid, "cart_confirm") },
	];
	for (const step of steps) {
		console.log(`  ${C.magenta("⊳")} ${step.label}`);
		const since = captures.length;
		const status = await step.fire();
		if (status !== 200) {
			console.log(`    ${C.red(`✗ webhook → ${status || "unreachable"}`)}`);
			continue;
		}
		// The cart path is deterministic (no model): its summary lands during the
		// webhook call, so a short window is plenty.
		printCaptured(await collectReplies(since, psid, 8_000, 1_200));
	}
	console.log("");
}

// Payment slice: drive the REAL @vit/assistant payment builders + REAL channel
// handlers (no model, deterministic), exactly as cli/payment-proof.ts does.
async function runPaymentSlice(anchor: string | undefined): Promise<void> {
	hr();
	console.log(C.bold("▶ payment buttons (#25) — real @vit/assistant payment domain"));
	if (anchor) console.log(`  ${C.dim("anchored on real export intent:")} ${C.cyan(redact(anchor))}`);
	const ref: PaymentRef = {
		paymentNumber: PAYMENT.paymentNumber,
		checkoutToken: PAYMENT.checkoutToken,
	};

	// 1) Order-created → the two payment-choice buttons (QPay url + transfer postback).
	const choice = buildPaymentChoice(process.env.STORE_PUBLIC_URL as string, ref);
	const qpayBtn = choice.buttons.find((b) => b.type === "web_url");
	const transferBtn = choice.buttons.find((b) => b.type === "postback");
	console.log(`  ${C.green("bot ›")} ${redact(choice.text)}`);
	console.log(`    ${C.dim(`[button] ${qpayBtn?.title} → ${qpayBtn?.url}`)}`);
	console.log(`    ${C.dim(`[button] ${transferBtn?.title} → postback ${transferBtn?.payload}`)}`);
	console.log(
		`    ${C.dim(`QPay url matches buildQpayPageUrl: ${qpayBtn?.url === buildQpayPageUrl(process.env.STORE_PUBLIC_URL as string, ref)}`)}`,
	);

	// 2) Customer taps "Дансаар шилжүүлэх" → real decode → real choose-transfer handler.
	console.log(`  ${C.magenta("⊳")} tap "${transferBtn?.title}" (${transferBtn?.payload})`);
	const chosen = parseChooseTransferPayload(chooseTransferPayload(ref)) as PaymentRef;
	const cap: { texts: string[]; bank: { text: string; payload: string }[]; status?: string } = {
		texts: [],
		bank: [],
	};
	const deps: PaymentHandlerDeps = {
		fetchPaymentSummary: async (r) => {
			const s = await fetchPaymentSummary(r.paymentNumber, r.checkoutToken);
			return { amount: s.total, reference: s.order.customerPhone };
		},
		claimTransfer: (r) => claimTransfer(r.paymentNumber, r.checkoutToken),
		sendBankDetails: async (text, paymentRef) => {
			cap.bank.push({ text, payload: claimTransferPayload(paymentRef) });
			return undefined;
		},
		sendText: async (text) => {
			cap.texts.push(text);
			return undefined;
		},
		setTransferStatus: async (status) => {
			cap.status = status;
		},
	};
	await handleChooseTransfer(chosen, deps);
	const bank = cap.bank[0];
	if (bank) {
		console.log(`    ${C.green("bot ›")} bank transfer details:`);
		for (const l of bank.text.split("\n")) console.log(`        ${C.dim(l)}`);
		console.log(`    ${C.dim(`[button] Шилжүүлсэн → postback ${bank.payload}`)}`);
		console.log(
			`    ${C.dim(`shows account ${bankTransfer.accountNumber} · amount ${PAYMENT.total.toLocaleString("en-US")} · ref ${PAYMENT.customerPhone}`)}`,
		);
	}

	// 3) Customer taps "Шилжүүлсэн" (claim) → real claim handler → ack, still pending.
	console.log(`  ${C.magenta("⊳")} tap "Шилжүүлсэн" claim button (${bank?.payload})`);
	const claimRef = parseClaimTransferPayload(claimTransferPayload(ref)) ?? ref;
	const cap2: typeof cap = { texts: [], bank: [] };
	await handleTransferClaim(claimRef, { ...deps, sendText: async (t) => { cap2.texts.push(t); }, setTransferStatus: async (s) => { cap2.status = s; } });
	console.log(`    ${C.green("bot ›")} ${redact(cap2.texts[0] ?? "")}`);
	console.log(`    ${C.dim(`ack matches TRANSFER_CLAIM_ACK_MESSAGE: ${cap2.texts[0] === TRANSFER_CLAIM_ACK_MESSAGE}`)}`);
	console.log(`    ${C.dim(`"хийсэн" / "hiisen" also claim: ${isTransferDoneText("хийсэн")} / ${isTransferDoneText("hiisen")}`)}`);
	console.log(
		`    ${C.dim(`ADR-0004 invariant — status is "${PAYMENT.status}" (a claim, NOT success); confirmation api calls: ${paymentCalls.confirmPayment + paymentCalls.confirmPaymentAndApplyStock}`)}`,
	);
	console.log("");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(C.bold("\n  Messenger export regression / review harness (#27)"));
	console.log(C.dim(`  export   ${EXPORT_DIR}`));
	console.log(C.dim(`  worker   ${WEBHOOK_URL}`));
	console.log(C.dim(`  catalog  fixture on :${FIXTURE_PORT}`));
	console.log(C.dim(`  capture  http://127.0.0.1:${CAPTURE_PORT} (Graph Send API)`));
	console.log(C.dim(`  model    ${NO_MODEL ? "OFF (--no-model: text slice is the documented split)" : "real Workers AI (Kimi)"}`));

	const msgs = loadCustomerMessages(400);
	if (msgs.length === 0) {
		console.log(
			C.yellow(
				`\n  ✗ no export at ${EXPORT_DIR}\n  The private Messenger export is gitignored & optional. Point at it with:\n    MESSENGER_EXPORT_DIR=/abs/path/to/messenger-chat-history bun run export:replay\n`,
			),
		);
		process.exit(2);
	}
	const product = pickExamples(msgs, SLICES[0]!, 3);
	const advice = pickExamples(msgs, SLICES[1]!, 3);
	const cartAnchor = pickExamples(msgs, SLICES[2]!, 1)[0];
	const payAnchor = pickExamples(msgs, SLICES[3]!, 1)[0];
	const photos = msgs.filter((m) => m.hasPhoto).length;

	console.log(
		C.dim(
			`\n  loaded ${msgs.length} customer messages · selected: ${product.length} product, ${advice.length} advice, cart anchor=${cartAnchor ? "yes" : "no"}, payment anchor=${payAnchor ? "yes" : "no"}, photo msgs=${photos}`,
		),
	);

	const fixture = startFixtureServer();
	const capture = startCaptureServer();
	try {
		await runTextSlice("text product lookup (#19) — real signed webhook → search_products → cards", product);
		await runTextSlice("product advice (#22) — real signed webhook → get_product_advice → reply", advice);
		await runCartSlice(cartAnchor);
		await runPaymentSlice(payAnchor);

		hr();
		console.log(C.bold("▶ photo lookup (#20) — SPLIT"));
		console.log(
			C.dim(
				`  ${photos} real photo message(s) exist in the export. Photo identification needs\n  the Kimi VISION binding (env.AI, unavailable under --local), so it is proven\n  separately by its own live harness:  bun run photo:proof`,
			),
		);
		hr();
		console.log(C.green("\n  ✓ replay complete — review the transcript above.\n"));
	} finally {
		fixture.stop();
		capture.stop();
	}
	process.exit(0);
}

void main();
