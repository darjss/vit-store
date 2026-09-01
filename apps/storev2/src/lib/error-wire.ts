import * as v from "valibot";

export const thrownErrorWireSchema = v.union([
	v.custom<Error>((input): input is Error => input instanceof Error),
	v.string(),
	v.number(),
	v.boolean(),
	v.null(),
	v.record(v.string(), v.union([v.string(), v.number(), v.boolean(), v.null()])),
]);

export type ThrownErrorWire = v.InferOutput<typeof thrownErrorWireSchema>;

export function errorKind(wire: ThrownErrorWire): string {
	if (wire instanceof Error) {
		return wire.name;
	}
	if (v.is(v.string(), wire)) {
		return "string";
	}
	if (v.is(v.number(), wire)) {
		return "number";
	}
	if (v.is(v.boolean(), wire)) {
		return "boolean";
	}
	if (wire === null) {
		return "null";
	}
	return "object";
}
