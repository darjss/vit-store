import * as v from "valibot";

// JSON-safe wire type for Codemode sandbox ↔ host RPC. Host/tRPC results cross
// this boundary as JSON text, then are parsed into CodemodeJson. structuredClone
// is the wrong tool here — it preserves Date/Map/undefined, which are not wire.
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

/** Parse JSON text that already crossed the host→sandbox boundary. */
export const parseCodemodeWireText = (wireText: string): CodemodeJson =>
	v.parse(codemodeJsonSchema, JSON.parse(wireText));

/**
 * Encode a host/tRPC return onto the Codemode JSON wire and validate it.
 * `TResult` is intentionally open — the contract is established by JSON text + schema,
 * not by pretending tRPC payloads are already CodemodeJson.
 */
export const serializeCodemodeJson = <TResult>(value: TResult): CodemodeJson =>
	parseCodemodeWireText(JSON.stringify(value ?? null));

export type CodemodeFn = (input?: CodemodeJson) => Promise<CodemodeJson>;

export const bindInput = <TSchema extends v.GenericSchema, TResult>(
	schema: TSchema,
	call: (input: v.InferOutput<TSchema>) => Promise<TResult>,
): CodemodeFn => {
	return async (raw) => serializeCodemodeJson(await call(v.parse(schema, raw)));
};

export const bindVoid = <TResult>(call: () => Promise<TResult>): CodemodeFn => {
	return async () => serializeCodemodeJson(await call());
};

// Alias kept for call sites that already import `toCodemodeJson`.
export const toCodemodeJson = serializeCodemodeJson;
