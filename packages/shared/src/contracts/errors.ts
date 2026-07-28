import * as v from "valibot";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
	| JsonPrimitive
	| JsonValue[]
	| { [key: string]: JsonValue };

/**
 * Public operation failures are plain records. Do not use Error subclasses at
 * RPC, structured-clone, storage, or logging boundaries.
 */
export type PublicError<Tag extends string = string> = {
	_tag: Tag;
	message?: string;
	[key: string]: JsonValue | undefined;
};

/** Create one strict branch for a public `_tag` error union. */
export const publicErrorSchema = <
	const Tag extends string,
	const Entries extends v.ObjectEntries,
>(
	tag: Tag,
	entries: Entries,
) =>
	v.strictObject({
		...entries,
		_tag: v.literal(tag),
	});
