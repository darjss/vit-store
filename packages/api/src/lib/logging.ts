import * as v from "valibot";

const MAX_ARRAY_ITEMS = 12;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;

const OBJECT_TAG = {
	bigint: "[object BigInt]",
	boolean: "[object Boolean]",
	number: "[object Number]",
	string: "[object String]",
} as const;

export type SummarizedLogScalar = string | number | boolean | null;

export type SummarizedLogError = {
	message: string;
	name: string;
	stack?: string;
};

export type SummarizedLogArray = {
	length: number;
	sample: SummarizedLogValue[];
	truncated: boolean;
	type: "array";
};

export type SummarizedLogObject = {
	[key: string]: SummarizedLogValue | number;
};

export type SummarizedLogValue =
	| SummarizedLogScalar
	| SummarizedLogError
	| SummarizedLogArray
	| SummarizedLogObject;

const logWireSchema: v.GenericSchema<LogWire> = v.lazy(() =>
	v.union([
		v.undefined(),
		v.null(),
		v.string(),
		v.number(),
		v.boolean(),
		v.custom<bigint>(
			(input): input is bigint => Object.prototype.toString.call(input) === OBJECT_TAG.bigint,
		),
		v.custom<Date>((input): input is Date => input instanceof Date),
		v.custom<Error>((input): input is Error => input instanceof Error),
		v.array(logWireSchema),
		v.record(v.string(), logWireSchema),
	]),
);

export type LogWire = v.InferOutput<typeof logWireSchema>;

export function parseLogWire(wire: LogWire): LogWire {
	return v.parse(logWireSchema, wire);
}

export const thrownErrorWireSchema = v.union([
	v.custom<Error>((input): input is Error => input instanceof Error),
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
	v.record(v.string(), v.union([v.string(), v.number(), v.boolean(), v.null()])),
]);

export type ThrownErrorWire = v.InferOutput<typeof thrownErrorWireSchema>;

export function parseThrownError(wire: ThrownErrorWire): Error {
	if (wire instanceof Error) {
		return wire;
	}
	if (v.is(v.string(), wire)) {
		return new Error(wire);
	}
	try {
		return new Error(JSON.stringify(wire));
	} catch {
		return new Error(String(wire));
	}
}

function objectTag(value: LogWire): string {
	return Object.prototype.toString.call(value);
}

function isPlainLogObject(value: LogWire): value is Record<string, LogWire> {
	return (
		value !== null &&
		objectTag(value) === "[object Object]" &&
		!Array.isArray(value) &&
		!(value instanceof Error) &&
		!(value instanceof Map) &&
		!(value instanceof Set)
	);
}

export function isSummarizedLogObject(value: SummarizedLogValue): value is SummarizedLogObject {
	if (value === null || Array.isArray(value)) {
		return false;
	}
	const tag = objectTag(value);
	if (tag === OBJECT_TAG.string || tag === OBJECT_TAG.number || tag === OBJECT_TAG.boolean) {
		return false;
	}
	if ("type" in value && value.type === "array") {
		return false;
	}
	if ("message" in value && "name" in value) {
		return false;
	}
	return tag === "[object Object]";
}

export function summarizeLogValue(value: LogWire, depth = 0): SummarizedLogValue {
	if (value === null) {
		return value;
	}
	if (
		v.is(
			v.custom<bigint>(
				(input): input is bigint => Object.prototype.toString.call(input) === OBJECT_TAG.bigint,
			),
			value,
		)
	) {
		return value.toString();
	}
	if (v.is(v.string(), value)) {
		return value.length > MAX_STRING_LENGTH
			? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated:${value.length}]`
			: value;
	}
	if (v.is(v.number(), value) || v.is(v.boolean(), value)) {
		return value;
	}
	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return {
			message: value.message,
			name: value.name,
			stack: value.stack,
		};
	}

	if (depth >= MAX_DEPTH) {
		if (Array.isArray(value)) {
			return { length: value.length, truncated: true, type: "array" };
		}
		return { truncated: true, type: value.constructor?.name ?? "object" };
	}

	if (Array.isArray(value)) {
		const sample = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => summarizeLogValue(item, depth + 1));
		return {
			length: value.length,
			sample,
			truncated: value.length > MAX_ARRAY_ITEMS,
			type: "array",
		};
	}

	if (value instanceof Map) {
		return summarizeLogValue(Object.fromEntries(value), depth + 1);
	}

	if (value instanceof Set) {
		return summarizeLogValue(Array.from(value), depth + 1);
	}

	if (!isPlainLogObject(value)) {
		return String(value);
	}

	const entries = Object.entries(value);
	const result: SummarizedLogObject = {};
	for (const [key, nestedValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
		result[key] = summarizeLogValue(nestedValue, depth + 1);
	}
	if (entries.length > MAX_OBJECT_KEYS) {
		result.__truncated_keys = entries.length - MAX_OBJECT_KEYS;
	}
	return result;
}

export function summarizeTrpcPayload(value: LogWire): SummarizedLogValue {
	return summarizeLogValue(value);
}

const restockSubscribeInputSchema = v.object({
	productId: v.number(),
});

const guestRestockInputSchema = v.object({
	channel: v.string(),
	productId: v.number(),
});

const restockSubscribeOutputSchema = v.object({
	alreadySubscribed: v.boolean(),
});

export function summarizeTrpcInputForLog(path: string, input: LogWire): SummarizedLogValue {
	if (!isPlainLogObject(input)) {
		return summarizeTrpcPayload(input);
	}
	if (path === "product.subscribeToRestock") {
		const parsed = v.safeParse(restockSubscribeInputSchema, input);
		if (parsed.success) {
			return { product_id: parsed.output.productId };
		}
	}
	if (path === "product.requestGuestRestockConfirmation") {
		const parsed = v.safeParse(guestRestockInputSchema, input);
		if (parsed.success) {
			return { channel: parsed.output.channel, product_id: parsed.output.productId };
		}
	}
	if (path === "product.confirmGuestRestockSubscription") {
		return { confirmation: "redacted" };
	}
	return summarizeTrpcPayload(input);
}

export function summarizeTrpcOutputForLog(path: string, output: LogWire): SummarizedLogValue {
	if (path === "product.requestGuestRestockConfirmation") {
		return { challenge_created: true };
	}
	if (path === "product.confirmGuestRestockSubscription" || path === "product.subscribeToRestock") {
		if (isPlainLogObject(output)) {
			const parsed = v.safeParse(restockSubscribeOutputSchema, output);
			if (parsed.success) {
				return { already_subscribed: parsed.output.alreadySubscribed, success: true };
			}
		}
		return { success: true };
	}
	return summarizeTrpcPayload(output);
}

/** @deprecated Use parseThrownError after v.parse(thrownErrorWireSchema, …) at catch sites. */
export function toError(error: ThrownErrorWire): Error {
	return parseThrownError(error);
}
