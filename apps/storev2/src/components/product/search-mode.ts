export function isProductSearchMode(
	term: string | null | undefined,
): term is string {
	return (term?.trim().length ?? 0) >= 2;
}
