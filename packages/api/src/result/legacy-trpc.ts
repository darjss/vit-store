import { TRPCError } from "@trpc/server";
import type { Result } from "better-result";

export type LegacyTrpcError = Pick<
	ConstructorParameters<typeof TRPCError>[0],
	"code" | "message"
>;

/** Preserve a legacy procedure's success DTO and expected tRPC error shape. */
export const toLegacyTrpc = <Value, Failure>(
	result: Result<Value, Failure>,
	mapError: (error: Failure) => LegacyTrpcError,
) => {
	const outcome = result.match<
		{ status: "ok"; value: Value } | { status: "error"; error: Failure }
	>({
		ok: (value) => ({ status: "ok", value }),
		err: (error) => ({ status: "error", error }),
	});

	if (outcome.status === "error") {
		throw new TRPCError(mapError(outcome.error));
	}
	return outcome.value;
};
