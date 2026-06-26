import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import { buildReadFns } from "./read-fns";

// Flue tools return JsonValue | undefined; the codemode sandbox returns
// `unknown`. This cast bridges the two without pulling Flue's internal JsonValue
// type (not re-exported). The value is already JSON-cleaned via
// JSON.parse(JSON.stringify(...)) before the cast.
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// A Flue tool that lets the admin agent write TypeScript which calls the
// read-fns registry through Codemode's isolated Dynamic Worker sandbox. The
// LLM writes `async () => { const orders = await codemode.getPendingOrders(); return orders; }`
// and the executor runs it with the fns exposed as `codemode.*`.
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
			"Run TypeScript code that queries store data via codemode.* functions. Write an async arrow function that calls codemode.getPendingOrders() (and other read fns) and returns the result. The return value is shown to you as the tool result.",
		input: v.object({
			code: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					"TypeScript code: an async arrow function, e.g. `async () => { const orders = await codemode.getPendingOrders(); return orders; }`",
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
			return {
				result: clean(result.result),
				logs: result.logs ?? [],
				...(result.error ? { error: result.error } : {}),
			} as Json;
		},
	});
}
