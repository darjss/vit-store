const MAX_CAUSE_DEPTH = 8;
const MAX_STACK_FRAMES = 30;
const MAX_STACK_FRAME_LENGTH = 500;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;

type SafeDiagnostic = {
	name: string;
	stack: string;
	code?: string | number;
	cause?: SafeDiagnostic;
};

function safeToken(value: unknown): string | number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	return typeof value === "string" && SAFE_TOKEN.test(value)
		? value
		: undefined;
}

function safeErrorName(value: string): string {
	return SAFE_TOKEN.test(value) ? value : "Error";
}

function safeStack(name: string, stack: string | undefined): string {
	const frames = (stack?.split("\n") ?? [])
		.filter((line) => /^\s*at\s+/.test(line))
		.slice(0, MAX_STACK_FRAMES)
		.map((line) => line.slice(0, MAX_STACK_FRAME_LENGTH));
	return [`${name}: [message redacted]`, ...frames].join("\n");
}

/**
 * Project an error for operator logs without retaining submitted values.
 *
 * Policy: discard every message and custom value; retain only bounded ASCII
 * names/codes and V8 `at ...` stack frames. Apply the same policy to at most
 * eight Error causes. Validation issues, error data, and non-Error causes are
 * intentionally excluded because they can embed request/customer payloads.
 */
export function operatorTrpcError(error: Error): Error {
	const seen = new Set<Error>();

	const project = (current: Error, depth: number): SafeDiagnostic => {
		const name = safeErrorName(current.name);
		const diagnostic: SafeDiagnostic = {
			name,
			stack: safeStack(name, current.stack),
		};
		const code = safeToken((current as Error & { code?: unknown }).code);
		if (code !== undefined) diagnostic.code = code;

		seen.add(current);
		const cause = (current as Error & { cause?: unknown }).cause;
		if (depth < MAX_CAUSE_DEPTH && cause instanceof Error && !seen.has(cause)) {
			diagnostic.cause = project(cause, depth + 1);
		}
		return diagnostic;
	};

	const diagnostic = project(error, 0);
	const projected = new Error("Error details redacted");
	projected.name = diagnostic.name;
	projected.stack = diagnostic.stack;
	if (diagnostic.code !== undefined) {
		Object.defineProperty(projected, "code", {
			value: diagnostic.code,
			enumerable: true,
		});
	}
	if (diagnostic.cause) {
		Object.defineProperty(projected, "cause", {
			value: diagnostic.cause,
			enumerable: true,
		});
	}
	return projected;
}
