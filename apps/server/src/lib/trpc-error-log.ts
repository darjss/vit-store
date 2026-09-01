import type { RequestLogger } from "evlog";

const MAX_CAUSE_DEPTH = 8;
const MAX_STACK_FRAMES = 30;
const MAX_STACK_FRAME_LENGTH = 500;
const SAFE_TOKEN = /^[A-Za-z0-9_.:-]{1,80}$/;

type SafeDiagnostic = {
	cause?: SafeDiagnostic;
	code?: string | number;
	name: string;
	stack: string;
};

function safeToken(value: unknown): string | number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	return typeof value === "string" && SAFE_TOKEN.test(value) ? value : undefined;
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

export type OperatorProjectedError = Error & {
	cause?: SafeDiagnostic;
	code?: string | number;
};

/**
 * Project an error for operator logs without retaining submitted values.
 *
 * Policy: discard every message and custom value; retain only bounded ASCII
 * names/codes and V8 `at ...` stack frames. Apply the same policy to at most
 * eight Error causes. Validation issues, error data, and non-Error causes are
 * intentionally excluded because they can embed request/customer payloads.
 */
export function operatorTrpcError(error: Error): OperatorProjectedError {
	const seen = new Set<Error>();

	const project = (current: Error, depth: number): SafeDiagnostic => {
		const name = safeErrorName(current.name);
		const diagnostic: SafeDiagnostic = {
			name,
			stack: safeStack(name, current.stack),
		};
		const code = safeToken((current as Error & { code?: unknown }).code);
		if (code !== undefined) {
			diagnostic.code = code;
		}

		seen.add(current);
		const cause = (current as Error & { cause?: unknown }).cause;
		if (depth < MAX_CAUSE_DEPTH && cause instanceof Error && !seen.has(cause)) {
			diagnostic.cause = project(cause, depth + 1);
		}
		return diagnostic;
	};

	const diagnostic = project(error, 0);
	const projected: OperatorProjectedError = new Error("Error details redacted");
	projected.name = diagnostic.name;
	projected.stack = diagnostic.stack;
	if (diagnostic.code !== undefined) {
		projected.code = diagnostic.code;
	}
	if (diagnostic.cause !== undefined) {
		projected.cause = diagnostic.cause;
	}
	return projected;
}

export function logTrpcError(
	log: RequestLogger,
	event: string,
	path: string | undefined,
	error: Error & { code?: string },
): void {
	const context = log.getContext();
	const fields = {
		event,
		trpc: { code: error.code, path },
	};

	// Procedure handlers may have already recorded the original database error.
	// Logging its wrapped tRPC error again makes evlog recursively merge Error
	// causes, including read-only properties on postgres errors.
	if (context.error !== undefined) {
		log.set(fields);
		return;
	}

	log.error(operatorTrpcError(error), fields);
}
