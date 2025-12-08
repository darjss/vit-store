const STORAGE_KEY = "vit-search-history";
const MAX_SEARCHES = 5;

export interface SearchHistoryItem {
	term: string;
	timestamp: number;
}

/**
 * Get recent searches from localStorage
 */
export function getRecentSearches(): SearchHistoryItem[] {
	if (typeof window === "undefined") return [];

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (!stored) return [];

		const items: SearchHistoryItem[] = JSON.parse(stored);
		// Return sorted by most recent first
		return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_SEARCHES);
	} catch {
		return [];
	}
}

/**
 * Add a search term to history
 */
export function addSearch(term: string): void {
	if (typeof window === "undefined") return;
	if (!term.trim()) return;

	try {
		const existing = getRecentSearches();

		// Remove duplicates (case-insensitive)
		const filtered = existing.filter(
			(item) => item.term.toLowerCase() !== term.toLowerCase(),
		);

		// Add new search at the beginning
		const newHistory: SearchHistoryItem[] = [
			{ term: term.trim(), timestamp: Date.now() },
			...filtered,
		].slice(0, MAX_SEARCHES);

		localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
	} catch {
		// Silently fail if localStorage is not available
	}
}

/**
 * Remove a specific search term from history
 */
export function removeSearch(term: string): void {
	if (typeof window === "undefined") return;

	try {
		const existing = getRecentSearches();
		const filtered = existing.filter(
			(item) => item.term.toLowerCase() !== term.toLowerCase(),
		);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
	} catch {
		// Silently fail
	}
}

/**
 * Clear all search history
 */
export function clearHistory(): void {
	if (typeof window === "undefined") return;

	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// Silently fail
	}
}

