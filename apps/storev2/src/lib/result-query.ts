import { queryOptions } from "@tanstack/solid-query";
import { deserializeResult, type ResultSchemas } from "@vit/shared";
import { Result, ResultDeserializationError } from "better-result";
import type * as v from "valibot";

type ResultQueryOptions<
	QueryKey extends readonly unknown[],
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
> = {
	queryKey: QueryKey;
	request: () => Promise<unknown>;
	schemas: ResultSchemas<ValueSchema, ErrorSchema>;
};

export const hydrateResult = <
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

export const resultQueryOptions = <
	const QueryKey extends readonly unknown[],
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>({
	queryKey,
	request,
	schemas,
}: ResultQueryOptions<QueryKey, ValueSchema, ErrorSchema>) =>
	queryOptions({
		queryKey,
		queryFn: async () => hydrateResult(await request(), schemas),
	});

export const resultMutationOptions = <
	Variables,
	ValueSchema extends v.GenericSchema,
	ErrorSchema extends v.GenericSchema,
>(
	request: (variables: Variables) => Promise<unknown>,
	schemas: ResultSchemas<ValueSchema, ErrorSchema>,
) => ({
	mutationFn: async (variables: Variables) =>
		hydrateResult(await request(variables), schemas),
});
