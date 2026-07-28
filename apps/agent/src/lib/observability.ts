import { observe, type FlueObservation, type PromptUsage } from "@flue/runtime";
import { match } from "dismatch";

const size = (value: unknown) =>
	value === undefined ? 0 : JSON.stringify(value).length;

const cacheLine = (usage: PromptUsage | undefined) => {
	const fresh = usage?.input ?? 0;
	const cached = usage?.cacheRead ?? 0;
	const hit =
		fresh + cached > 0 ? Math.round((cached / (fresh + cached)) * 100) : 0;
	return `fresh_in=${fresh} cacheRead=${cached} out=${usage?.output ?? "?"} total=${usage?.totalTokens ?? "?"} cacheHit=${hit}%`;
};

const tag = (event: FlueObservation) => {
	const parts = [
		event.agentName,
		event.dispatchId ?? event.instanceId,
		event.session,
	]
		.filter((part): part is string => typeof part === "string")
		.map((part) => part.slice(0, 12));
	return parts.length > 0 ? ` {${parts.join("/")}}` : "";
};

observe((event) => {
	match(
		event,
		"type",
	)<void>({
		run_start: () => undefined,
		run_resume: () => undefined,
		agent_start: () => undefined,
		agent_end: () => undefined,
		turn_start: () => undefined,
		turn_request: () => undefined,
		turn_messages: () => undefined,
		message_start: () => undefined,
		message_end: () => undefined,
		text_delta: () => undefined,
		thinking_start: () => undefined,
		thinking_delta: () => undefined,
		thinking_end: () => undefined,
		tool_start: (toolEvent) => {
			console.log(
				`[flue.tool] start ${toolEvent.toolName} args_size=${size(toolEvent.args)}${tag(toolEvent)}`,
			);
		},
		tool: (toolEvent) => {
			console.log(
				`[flue.tool] complete ${toolEvent.toolName} ${toolEvent.durationMs}ms result_size=${size(toolEvent.result)} is_error=${toolEvent.isError}${tag(toolEvent)}`,
			);
		},
		turn: (turnEvent) => {
			console.log(
				`[flue.turn] ${turnEvent.purpose} ${turnEvent.durationMs}ms ${cacheLine(turnEvent.response.usage)} is_error=${turnEvent.isError}${tag(turnEvent)}`,
			);
		},
		task_start: () => undefined,
		task: (taskEvent) => {
			if (taskEvent.isError) {
				console.error(`[flue.err] task_failed${tag(taskEvent)}`);
			}
		},
		compaction_start: () => undefined,
		compaction: (compactionEvent) => {
			console.log(
				`[flue.compaction] ${compactionEvent.messagesBefore}->${compactionEvent.messagesAfter} ${compactionEvent.durationMs}ms is_error=${compactionEvent.isError}${tag(compactionEvent)}`,
			);
		},
		operation_start: () => undefined,
		operation: (operationEvent) => {
			console.log(
				`[flue.op] ${operationEvent.operationKind} ${operationEvent.durationMs}ms ${cacheLine(operationEvent.usage)} is_error=${operationEvent.isError}${tag(operationEvent)}`,
			);
		},
		log: (logEvent) => {
			if (logEvent.level === "warn" || logEvent.level === "error") {
				console.log(
					`[flue.log] level=${logEvent.level} message_redacted=true${tag(logEvent)}`,
				);
			}
		},
		idle: () => undefined,
		submission_settled: (submissionEvent) => {
			if (submissionEvent.outcome === "failed") {
				console.error(`[flue.err] submission_failed${tag(submissionEvent)}`);
			}
		},
		run_end: (runEvent) => {
			if (runEvent.isError) {
				console.error(`[flue.err] run_failed${tag(runEvent)}`);
			}
		},
	});
});
