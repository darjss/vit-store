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
	info(event: string, data?: LogData) {
		evlog.info(withEvent(event, data));
	},
	warn(event: string, data?: LogData) {
		evlog.warn(withEvent(event, data));
	},
	error(event: string, error?: unknown, data?: LogData) {
		const err = toError(error ?? event);
		evlog.error({
			event,
			error: {
				name: err.name,
				message: err.message,
				stack: err.stack,
			},
			...(data ? (summarizeLogValue(data) as LogData) : {}),
		});
	},
};
