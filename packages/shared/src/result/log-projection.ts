import type { Result } from "better-result";
import { match } from "dismatch";

export type ResultLogContext = {
	operation: string;
	error_layer: string;
	attempt?: number;
	commit_state?: string;
	partial_success?: boolean;
	idempotency_outcome?: string;
	provider?: string;
};

type OperationOutcome<Failure> =
	| { status: "ok" }
	| { status: "error"; error: Failure }
	| { status: "panic"; correlation_id: string };

export type SafeResultLogProjection = ResultLogContext & {
	outcome: "ok" | "error";
	error_tag?: string;
	retryable?: boolean;
	panic?: true;
	correlation_id?: string;
};

const errorTag = (error: unknown) => {
	if (
		error !== null &&
		typeof error === "object" &&
		"_tag" in error &&
		typeof error._tag === "string"
	) {
		return error._tag;
	}
	return "UnknownExpectedError";
};

const retryable = (error: unknown) =>
	error !== null &&
	typeof error === "object" &&
	"retryable" in error &&
	typeof error.retryable === "boolean"
		? error.retryable
		: undefined;

const projectOperationOutcome = <Failure>(
	outcome: OperationOutcome<Failure>,
	context: ResultLogContext,
) =>
	match(
		outcome,
		"status",
	)<SafeResultLogProjection>({
		ok: () => ({ ...context, outcome: "ok" }),
		error: ({ error }) => ({
			...context,
			outcome: "error",
			error_tag: errorTag(error),
			...(retryable(error) === undefined
				? {}
				: { retryable: retryable(error) }),
		}),
		panic: ({ correlation_id }) => ({
			...context,
			outcome: "error",
			panic: true,
			correlation_id,
		}),
	});

/** Project an expected Result without copying public copy or arbitrary fields. */
export const projectResultForLog = <Value, Failure>(
	result: Result<Value, Failure>,
	context: ResultLogContext,
) =>
	result.match<SafeResultLogProjection>({
		ok: () => projectOperationOutcome({ status: "ok" }, context),
		err: (error) =>
			projectOperationOutcome({ status: "error", error }, context),
	});

/** Project an unexpected failure without copying the thrown value. */
export const projectPanicForLog = (
	correlationId: string,
	context: ResultLogContext,
) =>
	projectOperationOutcome(
		{ status: "panic", correlation_id: correlationId },
		context,
	);
