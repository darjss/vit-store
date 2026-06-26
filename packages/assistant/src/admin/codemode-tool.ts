import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { buildReadFns } from "./read-fns";

// Flue tools return JsonValue | undefined; the codemode sandbox returns
// `unknown`. This cast bridges the two without pulling Flue's internal JsonValue
// type (not re-exported). The value is already JSON-cleaned via
// JSON.parse(JSON.stringify(...)) before the cast.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Max chars of tool result to keep in conversation history. Larger results are
// truncated so the model's context doesn't bloat (e.g. getAllOrders can return
// 130k+ chars). The model should write targeted queries, not fetch everything.
const MAX_RESULT_CHARS = 8_000;

// A Flue tool that lets the admin agent write TypeScript which calls the
// read-fns registry through Codemode's isolated Dynamic Worker sandbox. The
// LLM writes `async () => { const orders = await order.getPendingOrders(); return orders; }`
// and the executor runs it with the fns exposed as namespaced providers
// (order.*, product.*, customer.*, etc.).
//
// `loader` is the Worker Loader binding (env.LOADER) — required by
// DynamicWorkerExecutor to spin up the sandbox Worker. Network access is fully
// isolated (globalOutbound: null): the sandbox can only reach the host through
// the fns, never the internet.
export function buildAdminQueryTool({
	loader,
	botToken,
	storeApiUrl,
}: {
	loader: WorkerLoader;
	botToken: string;
	storeApiUrl: string;
}) {
	return defineTool({
		name: "query",
		description:
			"Run TypeScript code that queries and mutates store data via namespaced functions. Write an async arrow function that calls order.getPendingOrders(), product.getProductById({ id: 42 }), product.updateStock({ productId: 42, numberToUpdate: 10, type: 'add' }), etc. and returns the result. The return value is shown to you as the tool result. IMPORTANT: Results larger than 8k chars are truncated — write targeted queries that return only what you need (filter by date/id, use count endpoints, select specific fields) instead of fetching entire tables.",
		input: v.object({
			code: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					"TypeScript code: an async arrow function, e.g. `async () => { const orders = await order.getPendingOrders(); return orders; }`",
				),
			),
		}),
		async run({ input }) {
			const executor = new DynamicWorkerExecutor({
				loader,
				timeout: 120_000,
				globalOutbound: null,
			});
			const fns = buildReadFns({ botToken, storeApiUrl });
			console.log(`[bot.code] ${input.code.slice(0, 500)}`);
			const result = await executor.execute(input.code, fns);
			// Clean the codemode result to a JSON-safe value (the sandbox returns
			// `unknown`; Flue tools must return JsonValue | undefined).
			const clean = (value: unknown): Json =>
				value === undefined ? null : JSON.parse(JSON.stringify(value)) as Json;
			const cleanedResult = clean(result.result);
			// Truncate large results to prevent context bloat. The model should
			// write targeted queries (e.g. filter by date, limit fields) instead
			// of fetching entire tables.
			const serialized = JSON.stringify(cleanedResult);
			const truncated: Json =
				serialized.length > MAX_RESULT_CHARS
					? {
							truncated: true,
							totalChars: serialized.length,
							preview: serialized.slice(0, MAX_RESULT_CHARS),
							hint: "Result was too large and was truncated. Write a more targeted query: filter by date/id, select only needed fields, or use a paginated/count endpoint.",
						}
					: cleanedResult;
			return {
				result: truncated,
				logs: result.logs ?? [],
				...(result.error ? { error: result.error } : {}),
			} as Json;
		},
	});
}
