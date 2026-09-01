import {
	boolean,
	custom,
	is,
	null as nullSchema,
	number,
	record,
	string,
	union,
	type InferOutput,
} from "valibot";

export function isNativeError(wire: ThrownErrorWire): wire is Error {
	return Object.prototype.toString.call(wire) === "[object Error]";
}

export const thrownErrorWireSchema = union([
	custom<Error>(isNativeError),
	string(),
	number(),
	boolean(),
	nullSchema(),
	record(string(), union([string(), number(), boolean(), nullSchema()])),
]);

export type ThrownErrorWire = InferOutput<typeof thrownErrorWireSchema>;

export function errorKind(wire: ThrownErrorWire): string {
	if (isNativeError(wire)) {
		return wire.name;
	}
	if (is(string(), wire)) {
		return "string";
	}
	if (is(number(), wire)) {
		return "number";
	}
	if (is(boolean(), wire)) {
		return "boolean";
	}
	if (wire === null) {
		return "null";
	}
	return "object";
}
