import { observe } from "@flue/runtime";

// Lightweight Flue event observer: one compact line per model turn (token
// usage) and per tool call (arg/result size). Registers globally per isolate —
// imported for side effect from the agent module so it runs inside the agent
// Durable Object where the model turns happen. Shows up in `wrangler tail` in
// prod and in the worker log under `bun run smoke` locally.
//
// This is how we *measure* the high-input-token issue: every `turn` line is one
// Kimi call, and the tool lines reveal which results bloat the context.

const size = (value: unknown): number =>
	value === undefined ? 0 : JSON.stringify(value).length;

observe((event) => {
	const e = event as Record<string, any>;
	if (e.usage) {
		const u = e.usage;
		const fresh = u.input ?? 0;
		const cached = u.cacheRead ?? 0;
		const hit = fresh + cached > 0 ? Math.round((cached / (fresh + cached)) * 100) : 0;
		console.log(
			`[flue.usage] ${e.type}${e.purpose ? `:${e.purpose}` : ""} fresh_in=${fresh} cacheRead=${cached} cacheWrite=${u.cacheWrite ?? 0} out=${u.output ?? "?"} total=${u.totalTokens ?? "?"} cacheHit=${hit}%`,
		);
	}
	if (event.type === "tool_start") {
		console.log(`[flue.tool] start ${e.toolName} args≈${size(e.args)}ch`);
	}
	if (event.type === "tool") {
		console.log(
			`[flue.tool] done  ${e.toolName} result≈${size(e.result)}ch`,
		);
	}
});
