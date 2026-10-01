// Runs the Messenger eval against a local `wrangler dev` (with scripts/capture.ts
// as the Zernio stand-in and scripts/store-stub.ts in front of the store API).
// Usage: bun scripts/eval/run.ts [--cases path] [--kinds product,faq] [--limit n]
//   [--concurrency 3] [--log /tmp/messenger-wrangler.log] [--capture /tmp/messenger-capture.jsonl]
// Each case gets a fresh conversation, so cases never share history or carts.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { evalCaseSchema, score, type EvalCase, type Observation } from "./rubric";

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};

const appRoot = join(import.meta.dirname, "..", "..");
const repoRoot = join(appRoot, "..", "..");
const evalDir = join(repoRoot, "messenger-chat-history", "eval");
const casesPath = arg("--cases") ?? join(evalDir, "cases.jsonl");
const kinds = arg("--kinds")?.split(",");
const limit = Number(arg("--limit") ?? "1000");
const concurrency = Number(arg("--concurrency") ?? "3");
const logPath = arg("--log") ?? "/tmp/messenger-wrangler.log";
const capturePath = arg("--capture") ?? "/tmp/messenger-capture.jsonl";
const webhookUrl = arg("--url") ?? "http://127.0.0.1:8787/zernio/webhook";
const adminBase = webhookUrl.replace(/\/zernio\/webhook$/, "");
const PHOTO_PORT = 8797;

const devVars = new Map(
	readFileSync(join(appRoot, ".dev.vars"), "utf8")
		.split("\n")
		.flatMap((line) => {
			const i = line.indexOf("=");
			return i > 0 && !line.trimStart().startsWith("#")
				? [[line.slice(0, i).trim(), line.slice(i + 1).trim()] as const]
				: [];
		}),
);
const devVar = (key: string): string => devVars.get(key) ?? "";

const allCases = readFileSync(casesPath, "utf8")
	.split("\n")
	.filter((l) => l.trim().length > 0)
	.map((l) => v.parse(evalCaseSchema, JSON.parse(l)));
const perKind = new Map<string, number>();
const cases = allCases.filter((c) => {
	if (kinds !== undefined && !kinds.includes(c.kind)) {
		return false;
	}
	const n = perKind.get(c.kind) ?? 0;
	perKind.set(c.kind, n + 1);
	return n < limit;
});

// Serves case photos so the worker can fetch them (PHOTO_HOSTS must include 127.0.0.1).
const photoFiles = cases.flatMap((c) => c.photos ?? []);
Bun.serve({
	fetch: (req) => {
		const index = Number(new URL(req.url).pathname.slice(1).replace(/\.jpg$/, ""));
		const file = photoFiles[index];
		return file === undefined
			? new Response("not found", { status: 404 })
			: new Response(Bun.file(file));
	},
	hostname: "127.0.0.1",
	port: PHOTO_PORT,
});
const photoUrl = (file: string): string =>
	`http://127.0.0.1:${PHOTO_PORT}/${photoFiles.indexOf(file)}.jpg`;

const hmacKey = await crypto.subtle.importKey(
	"raw",
	new TextEncoder().encode(devVar("ZERNIO_WEBHOOK_SECRET")),
	{ hash: "SHA-256", name: "HMAC" },
	false,
	["sign"],
);
const account = devVar("ZERNIO_ACCOUNT_IDS").split(",")[0]?.trim() ?? "";

const postEvent = async (conversation: string, text: string, image: string | undefined) => {
	const timestamp = new Date().toISOString();
	const body = JSON.stringify({
		account: { id: account, platform: "facebook" },
		conversation: { id: conversation, platformConversationId: `psid_${conversation}` },
		event: "message.received",
		id: crypto.randomUUID(),
		message: {
			attachments: image === undefined ? [] : [{ type: "image", url: image }],
			conversationId: conversation,
			direction: "incoming",
			id: `zmid_${crypto.randomUUID().slice(0, 8)}`,
			platform: "facebook",
			platformMessageId: `pmid_${crypto.randomUUID().slice(0, 8)}`,
			sender: { id: `psid_${conversation}`, name: "Eval" },
			sentAt: timestamp,
			text,
		},
		metadata: null,
		timestamp,
	});
	const signature = Buffer.from(
		await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(body)),
	).toString("hex");
	const res = await fetch(webhookUrl, {
		body,
		headers: { "content-type": "application/json", "x-zernio-signature": signature },
		method: "POST",
	});
	if (!res.ok) {
		throw new Error(`webhook ${res.status}`);
	}
};

const turnSchema = v.looseObject({
	conversation: v.string(),
	handoff: v.optional(v.boolean()),
	outcome: v.string(),
	product_ids: v.array(v.number()),
	tools: v.array(v.string()),
	total_ms: v.number(),
});
type Turn = v.InferOutput<typeof turnSchema>;

const finalTurn = (conversation: string): Turn | undefined => {
	const lines = readFileSync(logPath, "latin1").match(/\{"event":"turn"[^\n]*\}/g) ?? [];
	for (const line of lines.reverse()) {
		const parsed = v.safeParse(
			turnSchema,
			JSON.parse(Buffer.from(line, "latin1").toString("utf8")),
		);
		if (
			parsed.success &&
			parsed.output.conversation === conversation &&
			parsed.output.outcome !== "superseded"
		) {
			return parsed.output;
		}
	}
	return undefined;
};

const captureSchema = v.looseObject({
	at: v.string(),
	idempotencyKey: v.nullish(v.string()),
	body: v.looseObject({ message: v.optional(v.string()) }),
	path: v.string(),
});
const sentMessages = (conversation: string) =>
	readFileSync(capturePath, "utf8")
		.split("\n")
		.filter((l) => l.includes(`/conversations/${conversation}/messages`))
		.flatMap((l) => {
			const parsed = v.safeParse(captureSchema, JSON.parse(l));
			return parsed.success ? [parsed.output] : [];
		});

const productNames = async (ids: Array<number>): Promise<Array<string>> => {
	if (ids.length === 0) {
		return [];
	}
	const input = encodeURIComponent(JSON.stringify({ json: { ids } }));
	const res = await fetch(
		`${devVar("STORE_API_URL")}/trpc/store/product.getProductsByIdsForAssistant?input=${input}`,
		{ headers: { "user-agent": "curl/8.5" } },
	);
	const parsed = v.safeParse(
		v.looseObject({
			result: v.looseObject({
				data: v.looseObject({ json: v.array(v.looseObject({ name: v.string() })) }),
			}),
		}),
		await res.json(),
	);
	return parsed.success ? parsed.output.result.data.json.map((p) => p.name) : [];
};

const checkoutPhone = async (conversation: string): Promise<string | null> => {
	const thread = encodeURIComponent(`zernio:${account}:${conversation}`);
	const res = await fetch(`${adminBase}/admin/conversations/${thread}`, {
		headers: { authorization: `Bearer ${devVar("ADMIN_TOKEN")}` },
	});
	const parsed = v.safeParse(
		v.looseObject({ checkout: v.looseObject({ phone: v.nullish(v.string()) }) }),
		await res.json(),
	);
	return parsed.success ? (parsed.output.checkout.phone ?? null) : null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const runId = Date.now().toString(36);
mkdirSync(evalDir, { recursive: true });
const resultsPath = join(evalDir, `results-${runId}.jsonl`);

const observe = async (c: EvalCase, conversation: string, turn: Turn | undefined) => {
	const sends = sentMessages(conversation);
	const observation: Observation = {
		checkoutPhone: c.kind === "delivery" ? await checkoutPhone(conversation) : null,
		handoff: turn?.handoff ?? false,
		outcome: turn?.outcome ?? "timeout",
		productNames: await productNames(turn?.product_ids ?? []),
		replyText: sends
			.filter((s) => s.idempotencyKey?.endsWith(":text") ?? false)
			.map((s) => s.body.message ?? "")
			.filter((t) => t.length > 0)
			.join("\n"),
		tools: turn?.tools ?? [],
	};
	return { lastSendAt: sends.at(-1)?.at, observation };
};

const waitForTurn = async (conversation: string): Promise<Turn | undefined> => {
	for (let waited = 0; waited < 90_000; waited += 1000) {
		await sleep(1000);
		const turn = finalTurn(conversation);
		if (turn !== undefined) {
			return turn;
		}
	}
	return undefined;
};

const runCase = async (c: EvalCase) => {
	const conversation = `eval_${runId}_${c.id}`;
	const started = Date.now();
	for (const [i, text] of c.texts.entries()) {
		const photo = i === 0 ? c.photos?.[0] : undefined;
		await postEvent(conversation, text, photo === undefined ? undefined : photoUrl(photo));
		await sleep(300);
	}
	const turn = await waitForTurn(conversation);
	await sleep(1500);
	const { lastSendAt, observation } = await observe(c, conversation, turn);
	const result = {
		e2e_ms: lastSendAt === undefined ? null : Date.parse(lastSendAt) - started,
		id: c.id,
		kind: c.kind,
		observation,
		score: score(c, observation),
		texts: c.texts,
		total_ms: turn?.total_ms ?? null,
	};
	appendFileSync(resultsPath, JSON.stringify(result) + "\n");
	const preview = observation.replyText.slice(0, 80).replaceAll("\n", " ");
	console.log(`${result.score.pass ? "PASS" : "FAIL"} ${c.id} ${observation.outcome} ${preview}`);
	return result;
};

const results: Array<Awaited<ReturnType<typeof runCase>>> = [];
const queue = [...cases];
await Promise.all(
	Array.from({ length: concurrency }, async () => {
		for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
			results.push(await runCase(c));
		}
	}),
);

const pct = (values: Array<number>, p: number): number | null => {
	const sorted = values.toSorted((a, b) => a - b);
	return sorted.length === 0
		? null
		: (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null);
};
const summary = Object.fromEntries(
	[...new Set(results.map((r) => r.kind))].map((kind) => {
		const rows = results.filter((r) => r.kind === kind);
		const failedChecks: Record<string, number> = {};
		for (const r of rows) {
			for (const [check, ok] of Object.entries(r.score.checks)) {
				if (!ok) {
					failedChecks[check] = (failedChecks[check] ?? 0) + 1;
				}
			}
		}
		return [
			kind,
			{
				failed_checks: failedChecks,
				gave_up: rows.filter((r) => r.observation.replyText.includes("Шалгаад хэлье")).length,
				n: rows.length,
				pass: rows.filter((r) => r.score.pass).length,
			},
		];
	}),
);
const totals = results.flatMap((r) => (r.total_ms === null ? [] : [r.total_ms]));
const e2e = results.flatMap((r) => (r.e2e_ms === null ? [] : [r.e2e_ms]));
console.log(
	JSON.stringify(
		{
			e2e_ms: { p50: pct(e2e, 0.5), p90: pct(e2e, 0.9) },
			model_ms: { p50: pct(totals, 0.5), p90: pct(totals, 0.9) },
			pass: results.filter((r) => r.score.pass).length,
			results: resultsPath,
			summary,
			total: results.length,
		},
		null,
		2,
	),
);
process.exit(0);
