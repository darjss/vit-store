import { navigate } from "astro:transitions/client";
import { createSignal, onCleanup, onMount } from "solid-js";

/**
 * Hook to read and write a single URL search parameter in SolidJS components.
 * By default, skips view transitions to prevent blank screens during filter changes.
 *
 * @param key - The search parameter key to read/write
 * @param options - Optional configuration
 * @param options.defaultValue - Default value if the param doesn't exist (defaults to null)
 * @param options.skipTransition - If true, updates URL without triggering view transition (defaults to true)
 * @returns A tuple of [getter, setter] where getter is an Accessor and setter updates the URL
 *
 * @example
 * ```tsx
 * const [sort, setSort] = useSearchParam("sort", { defaultValue: "popular" });
 *
 * // Read the current value
 * const currentSort = sort(); // "popular" | "price" | null
 *
 * // Update the search param (skips view transition by default)
 * setSort("price");
 *
 * // Remove the search param
 * setSort(null);
 *
 * // Enable view transition for actual page navigation
 * const [page, setPage] = useSearchParam("page", { skipTransition: false });
 * ```
 */
export function useSearchParam(
	key: string,
	options?: { defaultValue?: string | null; skipTransition?: boolean },
): [() => string | null, (next: string | null) => void] {
	const [value, setValue] = createSignal(options?.defaultValue ?? null);

	onMount(() => {
		const read = () => new URLSearchParams(window.location.search).get(key);
		const sync = () => setValue(read() ?? options?.defaultValue ?? null);

		sync(); // hydrate with real URL param once we're on the client

		const onLocationChange = () => sync();
		window.addEventListener("popstate", onLocationChange);
		window.addEventListener("hashchange", onLocationChange);
		onCleanup(() => {
			window.removeEventListener("popstate", onLocationChange);
			window.removeEventListener("hashchange", onLocationChange);
		});
	});

	const setParam = (next: string | null) => {
		if (typeof window === "undefined") return;
		const url = new URL(window.location.href);
		const prev = url.searchParams.get(key);
		const normalized = next == null || next === "" ? null : next;
		if ((prev ?? null) === normalized) return; // avoid redundant nav

		if (normalized == null) url.searchParams.delete(key);
		else url.searchParams.set(key, normalized);

		// Default to skipping transitions to prevent blank screens during filter changes
		const shouldSkipTransition = options?.skipTransition ?? true;

		if (shouldSkipTransition) {
			const state = window.history.state ?? {};
			// Use replaceState directly to avoid triggering view transition
			window.history.replaceState(
				state,
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
