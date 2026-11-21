// Runs the order bridge extractor over labeled chats and writes one
// prediction per case to <dir>/runs/<name>/. Score with <dir>/score.ts.
// Usage: OPENAI_BASE_URL=... OPENAI_API_KEY=... \
//   bun scripts/eval/orders.ts --dir ~/dev/scratchpad/vit-store/order-bridge \
//   --name terra-low-v0 --split dev [--model gpt-6.1-terra] [--reasoning low|none|medium]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createOpenAI } from "@ai-sdk/openai";
import * as v from "valibot";
import { type ChatMessage, extractOrders, type ReasoningEffort } from "../../src/bridge/extract";

const { values: args } = parseArgs({
	args: process.argv.slice(2),
	options: {
		cases: { type: "string" },
		catalog: { type: "string" },
		concurrency: { default: "4", type: "string" },
		dir: { type: "string" },
		model: { type: "string" },
		name: { type: "string" },
		reasoning: { default: "low", type: "string" },
		resume: { default: false, type: "boolean" },
		retries: { default: "2", type: "string" },
		split: { type: "string" },
	},
	strict: true,
});

const dir = args.dir;
const name = args.name;
if (!dir || !name) {
	console.error(
		"Usage: bun scripts/eval/orders.ts --dir <bridge dir> --name <run> [--split dev|holdout] [--model gpt-6.1-terra] [--reasoning none|low|medium] [--concurrency 4] [--cases id1,id2] [--resume]",
	);
	process.exit(1);
}

const reasoningEffort = v.parse(v.picklist(["none", "low", "medium", "high"]), args.reasoning);
const concurrency = Math.max(1, Number.parseInt(args.concurrency, 10) || 4);
const retries = Math.max(0, Number.parseInt(args.retries, 10) || 2);
const modelId = args.model ?? process.env.MODEL ?? "gpt-6.1-terra";
const baseURL = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:8317/v1";
const apiKey = process.env.OPENAI_API_KEY ?? "";
if (!apiKey) {
	console.error("Set OPENAI_API_KEY before running scripts/eval/orders.ts.");
	process.exit(1);
}

// @ai-sdk/openai@3.0.117 drops reasoningEffort="none" for gpt-6* models other than
// gpt-6-sol/luna. Forward it explicitly when testing "none" against CLIProxyAPI.
const forceNoneFetch: typeof fetch | undefined =
	reasoningEffort === "none"
		? async (input, init) => {
				const rawBody = v.safeParse(v.string(), init?.body);
				if (rawBody.success) {
					const parsed = v.parse(v.looseObject({}), JSON.parse(rawBody.output));
					return fetch(input, {
						...init,
						body: JSON.stringify({ ...parsed, reasoning_effort: "none" }),
					});
				}
				return fetch(input, init);
			}
		: undefined;

const model = createOpenAI({ apiKey, baseURL, fetch: forceNoneFetch }).chat(modelId);

const catalogSchema = v.array(
	v.looseObject({
		amount: v.string(),
		brand: v.string(),
		compare_at_price: v.optional(v.nullable(v.number())),
		id: v.number(),
		name: v.string(),
		name_mn: v.optional(v.nullable(v.string())),
		potency: v.string(),
		price: v.number(),
		status: v.optional(v.string()),
	}),
);

const sampleSchema = v.array(
	v.looseObject({
		caseId: v.string(),
		split: v.string(),
	}),
);

const dumpedCaseSchema = v.looseObject({
	messages: v.array(
		v.looseObject({
			at: v.string(),
			direction: v.picklist(["incoming", "outgoing"]),
			photos: v.array(v.string()),
			text: v.string(),
		}),
	),
});

const catalogPath =
	args.catalog ?? join(homedir(), "dev/scratchpad/vit-store/catalog/catalog.json");
const catalog = v.parse(catalogSchema, JSON.parse(readFileSync(catalogPath, "utf8")));
const sample = v.parse(sampleSchema, JSON.parse(readFileSync(join(dir, "sample.json"), "utf8")));
const out = join(dir, "runs", name);
mkdirSync(out, { recursive: true });

const detectMediaType = (buf: Uint8Array): string => {
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return "image/png";
	}
	if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
		return "image/webp";
	}
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
		return "image/gif";
	}
	return "image/jpeg";
};

const load = (caseId: string): Array<ChatMessage> => {
	const { messages } = v.parse(
		dumpedCaseSchema,
		JSON.parse(readFileSync(join(dir, "cases", `${caseId}.json`), "utf8")),
	);
	return messages.map((m) => ({
		...m,
		photos: m.photos.map((p) => {
			const data = readFileSync(p);
			return { data, mediaType: detectMediaType(data) };
		}),
	}));
};

const onlyCases = args.cases ? new Set(args.cases.split(",").map((s) => s.trim())) : null;
const targets = sample.filter((c) => {
	if (args.split && c.split !== args.split) {
		return false;
	}
	if (onlyCases && !onlyCases.has(c.caseId)) {
		return false;
	}
	if (args.resume && existsSync(join(out, `${c.caseId}.json`))) {
		return false;
	}
	return true;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractWithRetry = async (caseId: string, effort: ReasoningEffort) => {
	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await extractOrders({
				catalog,
				messages: load(caseId),
				model,
				reasoningEffort: effort,
			});
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await sleep(1000 * (attempt + 1));
			}
		}
	}
	throw lastError;
};

const startedAt = Date.now();
let completed = 0;
let failed = 0;
let totalInput = 0;
let totalCached = 0;
let totalOutput = 0;
let totalReasoning = 0;
const failedIds: Array<string> = [];

const runOne = async (caseId: string) => {
	const t0 = Date.now();
	try {
		const { orders, usage } = await extractWithRetry(caseId, reasoningEffort);
		writeFileSync(join(out, `${caseId}.json`), JSON.stringify({ caseId, orders }, null, "\t"));
		const inputTokens = usage.inputTokens ?? 0;
		const cachedTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
		const outputTokens = usage.outputTokens ?? 0;
		const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? 0;
		totalInput += inputTokens;
		totalCached += cachedTokens;
		totalOutput += outputTokens;
		totalReasoning += reasoningTokens;
		completed++;
		console.error(
			`[${completed + failed}/${targets.length}] ${caseId}: ${orders.length} orders in ${((Date.now() - t0) / 1000).toFixed(1)}s (${inputTokens} in / ${cachedTokens} cached, ${outputTokens} out / ${reasoningTokens} rsn)`,
		);
	} catch (error) {
		failed++;
		failedIds.push(caseId);
		const msg = error instanceof Error ? error.message.slice(0, 240) : "unknown error";
		console.error(`[${completed + failed}/${targets.length}] ${caseId}: FAIL ${msg}`);
	}
};

// Warm the system-prompt cache with the first case before fanning out.
const [first, ...rest] = targets;
if (first) {
	await runOne(first.caseId);
}
let nextIndex = 0;
const worker = async () => {
	while (nextIndex < rest.length) {
		const c = rest[nextIndex++];
		if (c) {
			await runOne(c.caseId);
		}
	}
};
await Promise.all(Array.from({ length: Math.min(concurrency, rest.length) }, worker));

const summary = {
	cacheHitRate: totalInput > 0 ? Number(((100 * totalCached) / totalInput).toFixed(1)) : 0,
	completed,
	elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
	failed,
	failedIds,
	model: modelId,
	name,
	out,
	reasoning: reasoningEffort,
	split: args.split ?? "all",
	tokens: {
		cached: totalCached,
		input: totalInput,
		output: totalOutput,
		reasoning: totalReasoning,
	},
};
writeFileSync(join(out, "_meta.json"), JSON.stringify(summary, null, "\t"));
console.log(JSON.stringify(summary, null, 2));
if (failed > 0) {
	process.exit(1);
}
