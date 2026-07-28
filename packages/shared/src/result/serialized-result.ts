import type { SerializedResult } from "better-result";
import { Result } from "better-result";
import * as v from "valibot";

export type ResultSchemas<
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
> = {
	value: ValueSchema;
	error: ErrorSchema;
};

export const serializedResultSchema = <
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>({
	value,
	error,
}: ResultSchemas<ValueSchema, ErrorSchema>) =>
	v.variant("status", [
		v.strictObject({
			status: v.literal("ok"),
			value,
		}),
		v.strictObject({
			status: v.literal("error"),
			error,
		}),
	]);

/** Serialize and validate the complete public Result contract. */
export const serializeResult = <
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>(
	result: Result<v.InferInput<ValueSchema>, v.InferInput<ErrorSchema>>,
	schemas: ResultSchemas<ValueSchema, ErrorSchema>,
): SerializedResult<v.InferInput<ValueSchema>, v.InferInput<ErrorSchema>> => {
	if (result.status === "error" && result.error instanceof Error) {
		throw new TypeError("Public Result errors must be plain records.");
	}

	const serialized = Result.serialize(result);
	v.parse(serializedResultSchema(schemas), serialized);
	return serialized;
};
