import { picklist, safeParse } from "valibot";

export function parsePicklistValue<T extends ReadonlyArray<string>>(
	values: T,
	raw: string,
): T[number] | undefined {
	const parsed = safeParse(picklist(values), raw);
	return parsed.success ? parsed.output : undefined;
}
