import { createEffect, createSignal, onMount } from "solid-js";

export interface SearchParamsReturn {
	/**
	 * Get a specific search parameter value
	 */
	get: (key: string) => string | null;

	/**
	 * Get all search parameters as an object
	 */
	getAll: () => Record<string, string>;

	/**
	 * Set a search parameter (replaces existing value)
	 */
	set: (key: string, value: string) => void;

	/**
	 * Set multiple search parameters at once
	 */
	setMultiple: (params: Record<string, string>) => void;

	/**
	 * Remove a search parameter
	 */
	remove: (key: string) => void;

	/**
	 * Remove multiple search parameters
	 */
	removeMultiple: (keys: string[]) => void;

	/**
	 * Clear all search parameters
	 */
	clear: () => void;

	/**
	 * Check if a parameter exists
	 */
	has: (key: string) => boolean;

	/**
	 * Get the raw URLSearchParams object (reactive)
	 */
	params: () => URLSearchParams;

	/**
	 * Get the full query string
	 */
	toString: () => string;
}

export interface UseSearchParamsOptions {
	/**
	 * Whether to replace the history state instead of pushing a new one
	 * @default false
	 */
	replaceState?: boolean;

	/**
	 * Callback fired when search params change
	 */
	onChange?: (params: URLSearchParams) => void;
}

/**
 * Custom hook for managing URL search parameters in Solid.js
 * Works seamlessly with Astro's client:load directive
 *
 * @example
 * ```tsx
 * function ProductFilter() {
 *   const { get, set, remove, getAll } = useSearchParams();
 *
 *   return (
 *     <div>
 *       <input
 *         value={get('search') || ''}
 *         onInput={(e) => set('search', e.currentTarget.value)}
 *       />
 *       <button onClick={() => remove('search')}>Clear</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useSearchParams(
	options: UseSearchParamsOptions = {},
): SearchParamsReturn {
	const { replaceState = false, onChange } = options;

	const [params, setParams] = createSignal<URLSearchParams>(
		new URLSearchParams(),
	);

	onMount(() => {
		// Initialize with current URL search params
		const currentParams = new URLSearchParams(window.location.search);
		setParams(currentParams);

		// Listen for popstate events (browser back/forward)
		const handlePopState = () => {
			const newParams = new URLSearchParams(window.location.search);
			setParams(newParams);
			onChange?.(newParams);
		};

		window.addEventListener("popstate", handlePopState);

		return () => {
			window.removeEventListener("popstate", handlePopState);
		};
	});

	// Call onChange when params change
	createEffect(() => {
		const currentParams = params();
		if (onChange && currentParams.toString()) {
			onChange(currentParams);
		}
	});

	const updateURL = (newParams: URLSearchParams) => {
		const queryString = newParams.toString();
		const newUrl = queryString
			? `${window.location.pathname}?${queryString}`
			: window.location.pathname;

		if (replaceState) {
			window.history.replaceState({}, "", newUrl);
		} else {
			window.history.pushState({}, "", newUrl);
		}

		setParams(new URLSearchParams(newParams));
		onChange?.(newParams);
	};

	const get = (key: string): string | null => {
		return params().get(key);
	};

	const getAll = (): Record<string, string> => {
		const result: Record<string, string> = {};
		params().forEach((value, key) => {
			result[key] = value;
		});
		return result;
	};

	const set = (key: string, value: string) => {
		const newParams = new URLSearchParams(window.location.search);
		if (value) {
			newParams.set(key, value);
		} else {
			newParams.delete(key);
		}
		updateURL(newParams);
	};

	const setMultiple = (paramsObj: Record<string, string>) => {
		const newParams = new URLSearchParams(window.location.search);
		Object.entries(paramsObj).forEach(([key, value]) => {
			if (value) {
				newParams.set(key, value);
			} else {
				newParams.delete(key);
			}
		});
		updateURL(newParams);
	};

	const remove = (key: string) => {
		const newParams = new URLSearchParams(window.location.search);
		newParams.delete(key);
		updateURL(newParams);
	};

	const removeMultiple = (keys: string[]) => {
		const newParams = new URLSearchParams(window.location.search);
		keys.forEach((key) => newParams.delete(key));
		updateURL(newParams);
	};

	const clear = () => {
		updateURL(new URLSearchParams());
	};

	const has = (key: string): boolean => {
		return params().has(key);
	};

	const toString = (): string => {
		return params().toString();
	};

	return {
		get,
		getAll,
		set,
		setMultiple,
		remove,
		removeMultiple,
		clear,
		has,
		params,
		toString,
	};
}
