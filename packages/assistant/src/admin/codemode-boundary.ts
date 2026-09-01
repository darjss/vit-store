import * as v from "valibot";

// JSON-safe wire type for Codemode sandbox ↔ host RPC. SuperJSON/tRPC values are
// round-tripped through JSON.parse/stringify before crossing this boundary.
export type CodemodeJson =
	| null
	| boolean
	| number
	| string
	| Array<CodemodeJson>
	| { [key: string]: CodemodeJson };

const codemodeJsonSchema: v.GenericSchema<CodemodeJson> = v.lazy(() =>
	v.union([
		v.null(),
		v.boolean(),
		v.number(),
		v.string(),
		v.array(codemodeJsonSchema),
		v.record(v.string(), codemodeJsonSchema),
	]),
);

export const serializeCodemodeJson = <T>(value: T): CodemodeJson =>
	v.parse(codemodeJsonSchema, structuredClone(value) as CodemodeJson);

export type CodemodeFn = (input?: CodemodeJson) => Promise<CodemodeJson>;

export const bindInput = <TSchema extends v.GenericSchema>(
	schema: TSchema,
	call: (input: v.InferOutput<TSchema>) => Promise<CodemodeJson | object | null>,
): CodemodeFn => {
	return async (raw) => serializeCodemodeJson(await call(v.parse(schema, raw)));
};

export const bindVoid = (call: () => Promise<CodemodeJson | object | null>): CodemodeFn => {
	return async () => serializeCodemodeJson(await call());
};

// Alias kept for call sites that already import `toCodemodeJson`.
export const toCodemodeJson = serializeCodemodeJson;
