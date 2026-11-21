// Runs the Messenger eval against a local `wrangler dev` (with scripts/capture.ts
// as the Zernio stand-in and scripts/store-stub.ts in front of the store API).
// Usage: bun scripts/eval/run.ts [--cases path] [--kinds product,faq] [--limit n]
//   [--concurrency 3] [--log /tmp/messenger-wrangler.log] [--capture /tmp/messenger-capture.jsonl]
// Each case gets a fresh conversation, so cases never share history or carts.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { EVAL_DIR } from "./paths";
import { evalCaseSchema, score, type EvalCase, type Observation } from "./rubric";

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};

const appRoot = join(import.meta.dirname, "..", "..");
const evalDir = EVAL_DIR;
const casesPath = arg("--cases") ?? join(evalDir, "cases.jsonl");
const kinds = arg("--kinds")?.split(",");
const limit = Number(arg("--limit") ?? "1000");
const concurrency = Number(arg("--concurrency") ?? "3");
const logPath = arg("--log") ?? "/tmp/messenger-wrangler.log";
const capturePath = arg("--capture") ?? "/tmp/messenger-capture.jsonl";
const webhookUrl = arg("--url") ?? "http://127.0.0.1:8787/zernio/webhook";
const adminBase = webhookUrl.replace(/\/zernio\/webhook$/, "");
const PHOTO_PORT = 8797;

const devVarsPath =
	arg("--dev-vars") ??
	(existsSync(join(appRoot, ".dev.vars"))
		? join(appRoot, ".dev.vars")
		: join(evalDir, ".dev.vars"));
const devVars = new Map(
	readFileSync(devVarsPath, "utf8")
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

// Fail fast if any case photo is missing on disk instead of letting the worker
// silently drop a 404 image and run blind.
const photoFiles = cases.flatMap((c) => c.photos ?? []);
const missingPhotos = photoFiles.filter((file) => !existsSync(file));
if (missingPhotos.length > 0) {
	console.error(
		`Missing ${missingPhotos.length} photo file(s) referenced by ${casesPath}:\n${missingPhotos.slice(0, 10).join("\n")}`,
	);
	process.exit(1);
}
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

const postEvent = async (conversation: string, text: string, images: Array<string>) => {
	const timestamp = new Date().toISOString();
	const body = JSON.stringify({
		account: { id: account, platform: "facebook" },
		conversation: { id: conversation, platformConversationId: `psid_${conversation}` },
		event: "message.received",
		id: crypto.randomUUID(),
		message: {
			attachments: images.map((url) => ({ type: "image", url })),
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
	model: v.optional(v.string()),
	outcome: v.string(),
	product_ids: v.array(v.number()),
	steps: v.optional(v.number()),
	tokens_cached: v.optional(v.number()),
	tokens_in: v.optional(v.number()),
	tokens_out: v.optional(v.number()),
	tools: v.array(v.string()),
	total_ms: v.number(),
});
type Turn = v.InferOutput<typeof turnSchema>;

// Collects every completed (non-superseded) turn for one conversation so a
// multi-message burst that splits across two DO turns keeps all tools/cards/tokens.
const conversationTurns = (conversation: string): Array<Turn> => {
	const lines = readFileSync(logPath, "latin1").match(/\{"event":"turn"[^\n]*\}/g) ?? [];
	const turns: Array<Turn> = [];
	for (const line of lines) {
		const parsed = v.safeParse(
			turnSchema,
			JSON.parse(Buffer.from(line, "latin1").toString("utf8")),
		);
		if (
			parsed.success &&
			parsed.output.conversation === conversation &&
			parsed.output.outcome !== "superseded"
		) {
			turns.push(parsed.output);
		}
	}
	return turns;
};

const captureSchema = v.looseObject({
	at: v.string(),
	body: v.looseObject({ message: v.optional(v.string()) }),
	idempotencyKey: v.nullish(v.string()),
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

const checkoutState = async (
	conversation: string,
): Promise<{ address: string | null; countryside: boolean | null; phone: string | null }> => {
	const thread = encodeURIComponent(`zernio:${account}:${conversation}`);
	const res = await fetch(`${adminBase}/admin/conversations/${thread}`, {
		headers: { authorization: `Bearer ${devVar("ADMIN_TOKEN")}` },
	});
	const parsed = v.safeParse(
		v.looseObject({
			checkout: v.looseObject({
				address: v.nullish(v.string()),
				countryside: v.nullish(v.boolean()),
				phone: v.nullish(v.string()),
			}),
		}),
		await res.json(),
	);
	return parsed.success
		? {
				address: parsed.output.checkout.address ?? null,
				countryside: parsed.output.checkout.countryside ?? null,
				phone: parsed.output.checkout.phone ?? null,
			}
		: { address: null, countryside: null, phone: null };
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const runId = Date.now().toString(36);
mkdirSync(evalDir, { recursive: true });
const resultsPath = join(evalDir, `results-${runId}.jsonl`);

const observe = async (c: EvalCase, conversation: string, turns: Array<Turn>) => {
	const sends = sentMessages(conversation);
	const checkout =
		c.kind === "delivery"
			? await checkoutState(conversation)
			: { address: null, countryside: null, phone: null };
	const productIds = [...new Set(turns.flatMap((t) => t.product_ids))];
	const tools = turns.flatMap((t) => t.tools);
	const observation: Observation = {
		checkoutAddress: checkout.address,
		checkoutCountryside: checkout.countryside,
		checkoutPhone: checkout.phone,
		handoff: turns.some((t) => t.handoff === true),
		outcome: turns.at(-1)?.outcome ?? "timeout",
		productNames: await productNames(productIds),
		replyText: sends
			.filter((s) => s.idempotencyKey?.endsWith(":text") ?? false)
			.map((s) => s.body.message ?? "")
			.filter((t) => t.length > 0)
			.join("\n"),
		tools,
	};
	return { lastSendAt: sends.at(-1)?.at, observation };
};

const waitForTurns = async (conversation: string): Promise<Array<Turn>> => {
	for (let waited = 0; waited < 90_000; waited += 1000) {
		await sleep(1000);
		const turns = conversationTurns(conversation);
		if (turns.length > 0) {
			return turns;
		}
	}
	return [];
};

const turnTokens = (turns: Array<Turn>) => {
	const withTokens = turns.filter((t) => t.tokens_in !== undefined);
	if (withTokens.length === 0) {
		return null;
	}
	return {
		cached: withTokens.reduce((acc, t) => acc + (t.tokens_cached ?? 0), 0),
		in: withTokens.reduce((acc, t) => acc + (t.tokens_in ?? 0), 0),
		out: withTokens.reduce((acc, t) => acc + (t.tokens_out ?? 0), 0),
	};
};

const runCase = async (c: EvalCase) => {
	const conversation = `eval_${runId}_${c.id}`;
	const started = Date.now();
	const images = (c.photos ?? []).map(photoUrl);
	const texts = c.texts.length > 0 ? c.texts : [""];
	for (const [i, text] of texts.entries()) {
		await postEvent(conversation, text, i === 0 ? images : []);
		await sleep(300);
	}
	await waitForTurns(conversation);
	await sleep(1500);
	const turns = conversationTurns(conversation);
	const { lastSendAt, observation } = await observe(c, conversation, turns);
	const totalMs = turns.reduce((acc, t) => acc + t.total_ms, 0);
	const steps = turns.reduce((acc, t) => acc + (t.steps ?? 0), 0);
	const result = {
		e2e_ms: lastSendAt === undefined ? null : Date.parse(lastSendAt) - started,
		id: c.id,
		kind: c.kind,
		model: turns.find((t) => t.model !== undefined)?.model ?? null,
		observation,
		reference: c.reference,
		score: score(c, observation),
		steps: turns.length === 0 ? null : steps,
		texts: c.texts,
		tokens: turnTokens(turns),
		total_ms: turns.length === 0 ? null : totalMs,
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
		const failedIds: Array<string> = [];
		for (const r of rows) {
			if (!r.score.pass) {
				failedIds.push(r.id);
			}
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
				failed_ids: failedIds,
				gave_up: rows.filter((r) => r.observation.replyText.includes("Шалгаад хэлье")).length,
				n: rows.length,
				pass: rows.filter((r) => r.score.pass).length,
			},
		];
	}),
);
const totals = results.flatMap((r) => (r.total_ms === null ? [] : [r.total_ms]));
const e2e = results.flatMap((r) => (r.e2e_ms === null ? [] : [r.e2e_ms]));
const tokenRows = results.flatMap((r) => (r.tokens === null ? [] : [r.tokens]));
const tokensIn = tokenRows.reduce((acc, t) => acc + t.in, 0);
const tokensCached = tokenRows.reduce((acc, t) => acc + t.cached, 0);
const tokensOut = tokenRows.reduce((acc, t) => acc + t.out, 0);
const stepRows = results.flatMap((r) => (r.steps === null ? [] : [r.steps]));
console.log(
	JSON.stringify(
		{
			cases: casesPath,
			e2e_ms: { p50: pct(e2e, 0.5), p90: pct(e2e, 0.9) },
			model: results.find((r) => r.model !== null)?.model ?? null,
			model_ms: { p50: pct(totals, 0.5), p90: pct(totals, 0.9) },
			pass: results.filter((r) => r.score.pass).length,
			results: resultsPath,
			steps_avg:
				stepRows.length === 0
					? null
					: Number((stepRows.reduce((a, b) => a + b, 0) / stepRows.length).toFixed(2)),
			summary,
			tokens:
				tokenRows.length === 0
					? null
					: {
							cache_hit_pct:
								tokensIn === 0 ? 0 : Number(((tokensCached / tokensIn) * 100).toFixed(1)),
							cached: tokensCached,
							in: tokensIn,
							out: tokensOut,
						},
			total: results.length,
		},
		null,
		2,
	),
);
process.exit(0);
