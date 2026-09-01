import * as v from "valibot";

export function parsePicklistValue<T extends readonly string[]>(
	values: T,
	raw: string,
): T[number] | undefined {
	const parsed = v.safeParse(v.picklist(values), raw);
	return parsed.success ? parsed.output : undefined;
}
