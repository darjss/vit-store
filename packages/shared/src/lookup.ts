/**
 * Own-key lookup for a dictionary literal. Keeps the literal's inferred type at the
 * declaration while allowing a plain `string` key, and ignores inherited keys like `constructor`.
 */
export const lookup = <TValue>(
	dictionary: Readonly<Record<string, TValue>>,
	key: string,
): TValue | undefined => (Object.hasOwn(dictionary, key) ? dictionary[key] : undefined);
