import {
	projectResultForLog,
	serializeResult,
	type ResultLogContext,
	type ResultSchemas,
} from "@vit/shared";
import type { Result } from "better-result";
import type * as v from "valibot";
import type { Context } from "~/lib/context";

export const serializeOperationResult = <
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>(
	ctx: Context,
	result: Result<v.InferInput<ValueSchema>, v.InferInput<ErrorSchema>>,
	schemas: ResultSchemas<ValueSchema, ErrorSchema>,
	logContext: ResultLogContext,
) => {
	ctx.log.set({ operation_result: projectResultForLog(result, logContext) });
	return serializeResult(result, schemas);
};
