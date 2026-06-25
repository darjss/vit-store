import { observe } from "@flue/runtime";

// Comprehensive Flue event observer. Registers globally per isolate (imported for
// side effect from the agent module), so it runs inside the agent Durable Object
// where model turns happen and reports across every dispatch/session in this
// worker. Shows up in `wrangler tail` and — once Workers Logs is enabled in
// wrangler.jsonc — in the queryable Cloudflare dashboard logs for the worker and
// all its DOs.
//
// Each line is a structured, greppable record:
//   [flue.turn] one model (Kimi) inference  — durationMs is THE latency driver
//   [flue.tool] one tool call               — durationMs + arg/result size
//   [flue.op]   the whole request           — total time + token usage + cache
//   [flue.err]  failures / validation issues
// The `turn` durations break down exactly where a slow reply spends its seconds
// (each user message = N sequential turns), and the cache fields show how much of
// the input is the discounted cached prefix vs full-price fresh tokens.

const size = (value: unknown): number =>
	value === undefined ? 0 : JSON.stringify(value).length;

// Cache-hit % over an input split into fresh vs cached-prefix tokens.
const cacheLine = (u: Record<string, any> | undefined): string => {
	const fresh = u?.input ?? 0;
	const cached = u?.cacheRead ?? 0;
	const hit = fresh + cached > 0 ? Math.round((cached / (fresh + cached)) * 100) : 0;
	return `fresh_in=${fresh} cacheRead=${cached} out=${u?.output ?? "?"} total=${u?.totalTokens ?? "?"} cacheHit=${hit}%`;
};

// Correlation suffix so lines from concurrent customers/DOs can be told apart.
const tag = (e: Record<string, any>): string => {
	const parts = [e.agentName, e.dispatchId ?? e.instanceId, e.session]
		.filter(Boolean)
		.map((p: string) => String(p).slice(0, 12));
	return parts.length ? ` {${parts.join("/")}}` : "";
};

observe((event) => {
	const e = event as Record<string, any>;
	switch (e.type) {
		// One model inference. `durationMs` is the per-Kimi-call latency; a slow
		// reply is just N of these in sequence.
		case "turn":
			console.log(
				`[flue.turn] ${e.purpose ?? "?"} ${e.durationMs ?? "?"}ms ${cacheLine(e.response?.usage)}${e.isError ? " ERROR" : ""}${tag(e)}`,
			);
			break;
		case "tool_start":
			console.log(`[flue.tool] → ${e.toolName} args≈${size(e.args)}ch${tag(e)}`);
			break;
		case "tool":
			console.log(
				`[flue.tool] ✓ ${e.toolName} ${e.durationMs ?? "?"}ms result≈${size(e.result)}ch${e.isError ? " ERROR" : ""}${tag(e)}`,
			);
			if (e.isError)
				console.error(
					`[flue.err] tool ${e.toolName}: ${JSON.stringify(e.result ?? e.error).slice(0, 400)}${tag(e)}`,
				);
			break;
		// The whole user-message → reply operation: wall-clock + aggregate usage.
		case "operation":
			console.log(
				`[flue.op] ${e.operationKind ?? "prompt"} ${e.durationMs ?? "?"}ms ${cacheLine(e.usage)}${e.isError ? " ERROR" : ""}${tag(e)}`,
			);
			break;
		case "compaction":
			console.log(
				`[flue.compaction] ${e.messagesBefore}→${e.messagesAfter} ${e.durationMs ?? "?"}ms${e.isError ? " ERROR" : ""}${tag(e)}`,
			);
			break;
		// Failures and misconfiguration — surface loudly.
		case "operation_failed":
		case "model_not_configured":
			console.error(
				`[flue.err] ${e.type}: ${e.error?.message ?? JSON.stringify(e).slice(0, 240)}${tag(e)}`,
			);
			break;
		case "submission_settled":
			if (e.outcome === "failed")
				console.error(
					`[flue.err] submission failed: ${e.error?.message ?? e.error?.type ?? "?"}${tag(e)}`,
				);
			break;
		// Tool/schema problems that silently degrade behavior.
		case "tool_input_validation":
		case "tool_output_validation":
		case "tool_output_serialization":
		case "tool_name_conflict":
		case "tool_legacy_definition":
			console.warn(`[flue.warn] ${e.type} ${e.toolName ?? ""}${tag(e)}`);
			break;
		case "log":
			if (e.level === "warn" || e.level === "error")
				console.log(`[flue.log] ${e.level} ${e.message}${tag(e)}`);
			break;
	}
});
