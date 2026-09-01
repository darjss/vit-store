import { timeRangeSchema } from "@vit/shared/schema";
import * as v from "valibot";
import type { LogWire } from "~/lib/logging";

export const cacheProcedureInputSchema = v.object({
	timeRange: v.optional(timeRangeSchema),
	ttl: v.optional(v.number()),
});

export type CacheProcedureInput = v.InferOutput<typeof cacheProcedureInputSchema>;

export type CacheKvInput = CacheProcedureInput | null | undefined;

export function parseCacheKvInput(wire: LogWire): CacheKvInput {
	if (wire === null || wire === undefined) {
		return wire;
	}
	const parsed = v.safeParse(cacheProcedureInputSchema, wire);
	return parsed.success ? parsed.output : null;
}

export function normalizeCacheKvInput(input: CacheKvInput): CacheProcedureInput | null | undefined {
	if (input === null || input === undefined) {
		return input;
	}
	return input;
}
