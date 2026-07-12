export function getEffectiveProductSearchTerm(
	term: string | null | undefined,
): string | null {
	const normalized = term?.trim();
	return normalized && normalized.length >= 2 ? normalized : null;
}
