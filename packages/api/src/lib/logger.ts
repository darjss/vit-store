import { log as evlog } from "evlog";
import {
	type LogWire,
	type SummarizedLogObject,
	type SummarizedLogValue,
	type ThrownErrorWire,
	isSummarizedLogObject,
	parseLogWire,
	summarizeLogValue,
	toError,
} from "~/lib/logging";

export type LogData = LogWire;

function withEvent(event: string, data?: LogData): SummarizedLogObject {
	const payload: SummarizedLogObject = { event };
	if (data === undefined) {
		return payload;
	}
	return mergeSummarizedFields(payload, summarizeLogValue(parseLogWire(data)));
}

function mergeSummarizedFields(
	base: SummarizedLogObject,
	summarized: SummarizedLogValue,
): SummarizedLogObject {
	if (isSummarizedLogObject(summarized)) {
		return { ...base, ...summarized };
	}
	return { ...base, value: summarized };
}

export const logger = {
	debug(event: string, data?: LogData) {
		evlog.debug(withEvent(event, data));
	},
	error(event: string, error?: ThrownErrorWire | string, data?: LogData) {
		const err = toError(error ?? event);
		let payload: SummarizedLogObject = {
			error: {
				message: err.message,
				name: err.name,
				stack: err.stack,
			},
			event,
		};
		if (data !== undefined) {
			payload = mergeSummarizedFields(payload, summarizeLogValue(parseLogWire(data)));
		}
		evlog.error(payload);
	},
	info(event: string, data?: LogData) {
		evlog.info(withEvent(event, data));
	},
	warn(event: string, data?: LogData) {
		evlog.warn(withEvent(event, data));
	},
};
