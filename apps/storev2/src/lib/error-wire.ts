import {
	boolean,
	custom,
	is,
	null as nullSchema,
	number,
	record,
	string,
	union,
	type GenericSchema,
} from "valibot";

export type ThrownErrorWire =
	| Error
	| string
	| number
	| boolean
	| null
	| Record<string, string | number | boolean | null>;

const nativeErrorSchema = custom<Error>(
	(input) => Object.prototype.toString.call(input) === "[object Error]",
);

export function isNativeError(wire: ThrownErrorWire): wire is Error {
	return is(nativeErrorSchema, wire);
}

export const thrownErrorWireSchema: GenericSchema<ThrownErrorWire> = union([
	nativeErrorSchema,
	string(),
	number(),
	boolean(),
	nullSchema(),
	record(string(), union([string(), number(), boolean(), nullSchema()])),
]);

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
