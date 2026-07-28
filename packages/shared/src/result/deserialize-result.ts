import { Result, ResultDeserializationError } from "better-result";
import * as v from "valibot";
import {
	type ResultSchemas,
	serializedResultSchema,
} from "./serialized-result";

/** Validate the envelope and both payload branches before hydrating a Result. */
export const deserializeResult = <
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>(
	value: unknown,
	schemas: ResultSchemas<ValueSchema, ErrorSchema>,
): Result<
	v.InferOutput<ValueSchema>,
	v.InferOutput<ErrorSchema> | ResultDeserializationError
> => {
	const parsed = v.safeParse(serializedResultSchema(schemas), value);
	if (!parsed.success) {
		return Result.err(new ResultDeserializationError({ value }));
	}

	return Result.deserialize<
		v.InferOutput<ValueSchema>,
		v.InferOutput<ErrorSchema>
	>(parsed.output);
};

/** Keep malformed wire data in the TanStack transport-error path. */
export const deserializeResultOrThrow = <
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>(
	value: unknown,
	schemas: ResultSchemas<ValueSchema, ErrorSchema>,
) => {
	const outcome = deserializeResult(value, schemas).match<
		| Result<v.InferOutput<ValueSchema>, v.InferOutput<ErrorSchema>>
		| ResultDeserializationError
	>({
		ok: (resultValue) => Result.ok(resultValue),
		err: (error) =>
			ResultDeserializationError.is(error) ? error : Result.err(error),
	});

	if (ResultDeserializationError.is(outcome)) throw outcome;
	return outcome;
};
