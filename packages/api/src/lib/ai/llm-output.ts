import { TRPCError } from "@trpc/server";
import type { z } from "zod";

export function parseLlmOutput<T extends z.ZodType>(
	schema: T,
	raw: z.input<T>,
	errorMessage = "LLM output validation failed",
): z.infer<T> {
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: errorMessage,
		});
	}
	return parsed.data;
}
