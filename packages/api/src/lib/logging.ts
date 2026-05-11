const MAX_ARRAY_ITEMS = 12;
const MAX_OBJECT_KEYS = 40;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 4;

export function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	if (typeof error === "string") return new Error(error);
	try {
		return new Error(JSON.stringify(error));
	} catch {
		return new Error(String(error));
	}
}

export function summarizeLogValue(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "bigint") return value.toString();
	if (typeof value === "string") {
		return value.length > MAX_STRING_LENGTH
			? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated:${value.length}]`
			: value;
	}
	if (typeof value !== "object") return value;

	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (depth >= MAX_DEPTH) {
		return Array.isArray(value)
			? { type: "array", length: value.length, truncated: true }
			: { type: value.constructor?.name ?? "object", truncated: true };
	}

	if (Array.isArray(value)) {
		const sample = value
			.slice(0, MAX_ARRAY_ITEMS)
			.map((item) => summarizeLogValue(item, depth + 1));
		return {
			type: "array",
			length: value.length,
			truncated: value.length > MAX_ARRAY_ITEMS,
			sample,
		};
	}

	if (value instanceof Map) {
		return summarizeLogValue(Object.fromEntries(value), depth + 1);
	}

	if (value instanceof Set) {
		return summarizeLogValue(Array.from(value), depth + 1);
	}

	const entries = Object.entries(value as Record<string, unknown>);
	const result: Record<string, unknown> = {};
	for (const [key, nestedValue] of entries.slice(0, MAX_OBJECT_KEYS)) {
		result[key] = summarizeLogValue(nestedValue, depth + 1);
	}
	if (entries.length > MAX_OBJECT_KEYS) {
		result.__truncated_keys = entries.length - MAX_OBJECT_KEYS;
	}
	return result;
}

export function summarizeTrpcPayload(value: unknown): unknown {
	return summarizeLogValue(value);
}
