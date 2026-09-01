import { log as evlog } from "evlog";
import { summarizeLogValue, toError } from "~/lib/logging";

type LogData = Record<string, unknown>;

function withEvent(event: string, data?: LogData) {
	return { event, ...(data ? (summarizeLogValue(data) as LogData) : {}) };
}

export const logger = {
	debug(event: string, data?: LogData) {
		evlog.debug(withEvent(event, data));
	},
	error(event: string, error?: unknown, data?: LogData) {
		const err = toError(error ?? event);
		evlog.error({
			error: {
				message: err.message,
				name: err.name,
				stack: err.stack,
			},
			event,
			...(data ? (summarizeLogValue(data) as LogData) : {}),
		});
	},
	info(event: string, data?: LogData) {
		evlog.info(withEvent(event, data));
	},
	warn(event: string, data?: LogData) {
		evlog.warn(withEvent(event, data));
	},
};
