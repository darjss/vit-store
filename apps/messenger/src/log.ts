// One canonical JSON line per turn. Wide fields beat many narrow lines: grep
// for `event":"turn"` gets the whole story.
export const turnLog = (fields: {
	action?: string;
	ad_id?: string;
	attempt: number;
	conversation: string;
	handoff: boolean;
	inputs: number;
	model: string;
	outcome: string;
	photos: number;
	product_ids: Array<number>;
	replayed?: boolean;
	reply_text?: string;
	step_ms: Array<number>;
	steps: number;
	thread: string;
	tokens_cached: number;
	tokens_in: number;
	tokens_out: number;
	tool_calls: Array<{ input: unknown; name: string }>;
	tools: Array<string>;
	total_ms: number;
	turn_id: string;
}) => {
	console.log(JSON.stringify({ event: "turn", ...fields }));
};

export const errorFields = (cause: unknown): { message: string; name: string } =>
	cause instanceof Error
		? { message: cause.message, name: cause.name }
		: { message: String(cause), name: "Error" };

// The failure half of the turn event, emitted before failed inbox rows go
// back to pending so the log carries the turn/event ids the retry reuses.
export const turnFailedLog = (fields: {
	attempts: number;
	error: { message: string; name: string };
	event_ids: Array<string>;
	thread: string;
	turn_ids: Array<string>;
}) => {
	console.log(JSON.stringify({ event: "turn", outcome: "error", ...fields }));
};
