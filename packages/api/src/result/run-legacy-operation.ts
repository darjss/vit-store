import { TRPCError } from "@trpc/server";
import type { Result } from "better-result";
import type { Context } from "~/lib/context";
import { toLegacyTrpc, type LegacyTrpcError } from "~/result/legacy-trpc";

export const runLegacyOperation = async <Value, Failure>(
	ctx: Context,
	event: string,
	unexpectedMessage: string,
	operation: () => Promise<Result<Value, Failure>>,
	mapError: (error: Failure) => LegacyTrpcError,
) => {
	try {
		return toLegacyTrpc(await operation(), mapError);
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		// The request middleware logs the unexpected failure once. Keep only
		// operation context here so this adapter does not create a duplicate event.
		ctx.log.set({ operation: event });
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: unexpectedMessage,
			cause: error,
		});
	}
};
