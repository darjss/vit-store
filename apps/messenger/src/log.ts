// One canonical JSON line per event. Every line carries an `event` tag and
// conversation-scoped lines carry `thread` (zernio:<acc>:<conv>), so Axiom's
// parse_json(body) can filter either. Failures go through console.error so
// severity_text lands as `error`; everything else is console.log.

export const errorFields = (cause: unknown): { message: string; name: string } =>
	cause instanceof Error
		? { message: cause.message, name: cause.name }
		: { message: String(cause), name: "Error" };

type TurnLogFields = {
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
};

type TurnFailedFields = {
	attempts: number;
	error: { message: string; name: string };
	event_ids: Array<string>;
	thread: string;
	turn_ids: Array<string>;
};

export type LogEvent =
	| (TurnLogFields & { event: "turn" })
	| ({ event: "turn"; outcome: "error" } & TurnFailedFields)
	| {
			error?: { message: string; name: string };
			event: "error";
			issues?: string;
			thread?: string;
			where: string;
	  }
	| {
			alert: "already_sent" | "failed" | "not_configured" | "sent";
			alert_status?: number;
			event: "handoff";
			key: string;
			reason: string;
			thread: string;
	  }
	| { event: "history_prefill"; outcome: string; thread: string }
	| {
			ad_id?: string;
			event: "inbound";
			event_id: string;
			inserted: boolean;
			kind: "photo" | "tap" | "text";
			text_len: number;
			thread: string;
	  }
	| {
			age_ms?: number;
			event: "inbound_drop";
			event_id?: string;
			issues?: string;
			reason: "no_conversation_id" | "stale" | "unparsed";
	  }
	| {
			countryside: boolean;
			error?: { message: string; name: string };
			event: "order";
			items: number;
			order_number?: string;
			outcome: "created" | "error";
			payment_number?: string;
			thread: string;
			total?: number;
	  }
	| {
			action:
				| "claimed"
				| "failed"
				| "gone"
				| "handoff"
				| "paid_send_failed"
				| "paid_sent"
				| "wait"
				| "window_end";
			claimed: number;
			error?: { message: string; name: string };
			event: "payment";
			payment_number: string;
			recon?: string;
			status?: string;
			thread: string;
	  }
	| { event: "recover"; rows: number; thread: string }
	| {
			attempts: number;
			conversation: string;
			error?: { message: string; name: string };
			event: "send";
			key: string;
			message_id?: null | string;
			ms: number;
			outcome: "failed" | "reconciled" | "sent";
			status?: number;
			text?: string;
			thread: string;
	  }
	| {
			event: "tap";
			kind: string;
			outcome: string;
			payment_number?: string;
			thread: string;
	  };

export const log = (e: LogEvent): void => {
	console.log(JSON.stringify(e));
};

export const logError = (e: LogEvent): void => {
	console.error(JSON.stringify(e));
};

export const turnLog = (fields: TurnLogFields): void => log({ event: "turn", ...fields });

// The failure half of the turn event, emitted before failed inbox rows go
// back to pending so the log carries the turn/event ids the retry reuses.
export const turnFailedLog = (fields: TurnFailedFields): void =>
	logError({ event: "turn", outcome: "error", ...fields });
