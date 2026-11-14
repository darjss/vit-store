// Runs the order bridge extractor over labeled chats and writes one
// prediction per case to <dir>/runs/<name>/. Score with <dir>/score.ts.
// Usage: OPENAI_BASE_URL=... OPENAI_API_KEY=... MODEL=gpt-6-luna \
//   bun scripts/eval/orders.ts --dir ~/dev/scratchpad/vit-store/order-bridge --name v1 [--split dev]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createOpenAI } from "@ai-sdk/openai";
import { type CatalogProduct, type ChatMessage, extractOrders } from "../../src/bridge/extract";

const arg = (flag: string) => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const dir = arg("--dir");
const name = arg("--name");
if (!dir || !name) {
	console.error(
		"Usage: bun scripts/eval/orders.ts --dir <bridge dir> --name <run> [--split dev|holdout]",
	);
	process.exit(1);
}
const split = arg("--split");

const model = createOpenAI({
	apiKey: process.env.OPENAI_API_KEY ?? "",
	baseURL: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:8317/v1",
}).chat(process.env.MODEL ?? "gpt-6-luna");

const catalog: Array<CatalogProduct & { status: string }> = JSON.parse(
	readFileSync(
		join(process.env.HOME ?? "", "dev/scratchpad/vit-store/catalog/catalog.json"),
		"utf8",
	),
);
const sample: Array<{ caseId: string; split: string }> = JSON.parse(
	readFileSync(join(dir, "sample.json"), "utf8"),
);
const out = join(dir, "runs", name);
mkdirSync(out, { recursive: true });

type Dumped = { messages: Array<Omit<ChatMessage, "photos"> & { photos: Array<string> }> };
const load = (caseId: string): Array<ChatMessage> => {
	const { messages }: Dumped = JSON.parse(
		readFileSync(join(dir, "cases", `${caseId}.json`), "utf8"),
	);
	return messages.map((m) => ({
		...m,
		photos: m.photos.map((p) => ({ data: readFileSync(p), mediaType: "image/jpeg" })),
	}));
};

const queue = sample.filter((c) => !split || c.split === split);
let failed = 0;
const worker = async () => {
	for (let c = queue.shift(); c; c = queue.shift()) {
		try {
			const orders = await extractOrders({ catalog, messages: load(c.caseId), model });
			writeFileSync(
				join(out, `${c.caseId}.json`),
				JSON.stringify({ caseId: c.caseId, orders }, null, "\t"),
			);
		} catch (error) {
			failed++;
			console.error(c.caseId, error instanceof Error ? error.message.slice(0, 200) : "error");
		}
	}
};
await Promise.all(Array.from({ length: 4 }, worker));
console.log({ failed, out });
