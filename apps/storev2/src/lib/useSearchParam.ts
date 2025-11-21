import { createSignal, onCleanup } from "solid-js";
import { navigate } from "astro:transitions/client";

/**
 * Hook to read and write a single URL search parameter in SolidJS components.
 * Uses Astro view transitions for navigation, ensuring smooth page transitions.
 *
 * @param key - The search parameter key to read/write
 * @param options - Optional configuration
 * @param options.defaultValue - Default value if the param doesn't exist (defaults to null)
 * @param options.skipTransition - If true, updates URL without triggering view transition (defaults to false)
 * @returns A tuple of [getter, setter] where getter is an Accessor and setter updates the URL
 *
 * @example
 * ```tsx
 * const [sort, setSort] = useSearchParam("sort", { defaultValue: "popular" });
 *
 * // Read the current value
 * const currentSort = sort(); // "popular" | "price" | null
 *
 * // Update the search param (triggers view transition)
 * setSort("price");
 *
 * // Remove the search param
 * setSort(null);
 *
 * // Skip view transition for frequent updates (e.g., scroll position)
 * const [cursor, setCursor] = useSearchParam("cursor", { skipTransition: true });
 * ```
 */
export function useSearchParam(
	key: string,
	options?: { defaultValue?: string | null; skipTransition?: boolean },
): [() => string | null, (next: string | null) => void] {
	const isClient = typeof window !== "undefined";
	const read = () =>
		isClient ? new URLSearchParams(window.location.search).get(key) : null;

	const [value, setValue] = createSignal(
		read() ?? options?.defaultValue ?? null,
	);

	if (isClient) {
		const onLocationChange = () =>
			setValue(read() ?? options?.defaultValue ?? null);
		window.addEventListener("popstate", onLocationChange);
		window.addEventListener("hashchange", onLocationChange);
		onCleanup(() => {
			window.removeEventListener("popstate", onLocationChange);
			window.removeEventListener("hashchange", onLocationChange);
		});
	}

	const setParam = (next: string | null) => {
		if (!isClient) return;
		const url = new URL(window.location.href);
		const prev = url.searchParams.get(key);
		const normalized = next == null || next === "" ? null : next;
		if ((prev ?? null) === normalized) return; // avoid redundant nav

		if (normalized == null) url.searchParams.delete(key);
		else url.searchParams.set(key, normalized);

		if (options?.skipTransition) {
			// Use replaceState directly to avoid triggering view transition
			window.history.replaceState(
				{ ...window.history.state },
				"",
				url.pathname + url.search + url.hash,
			);
			// Manually update the signal since replaceState doesn't trigger popstate
			setValue(normalized);
		} else {
			navigate(url.pathname + url.search + url.hash, { history: "replace" });
		}
	};

	return [value, setParam];
}

