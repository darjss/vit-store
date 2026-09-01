import { useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal } from "solid-js";
import { trackSearchPerformed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

export interface SearchStorefrontData {
	brands: Array<{
		id: number;
		logoUrl?: string | null;
		name: string;
		productCount: number;
		slug: string;
	}>;
	categories: Array<{
		id: number;
		name: string;
		productCount: number;
		slug: string;
	}>;
	products: Array<{
		brand: string;
		categoryId?: number;
		discount?: number;
		id: number;
		image: string;
		name: string;
		price: number;
		slug: string;
		stock?: number;
	}>;
}

export interface UseSearchStorefrontOptions {
	/** Result cap passed to the API. */
	limit?: number;
	/** Minimum query length before the search fires. */
	minQueryLength?: number;
}

export interface UseSearchStorefrontResult {
	data: () => SearchStorefrontData | undefined;
	fetchStatus: () => "fetching" | "paused" | "idle";
	isError: () => boolean;
	isFetching: () => boolean;
	isLoading: () => boolean;
	isLoadingError: () => boolean;
	isRefetchError: () => boolean;
	refetch: () => void;
	searchId: () => string | null;
	status: () => "pending" | "error" | "success";
}

/**
 * Shared storefront search query used by both the search takeover (sheet) and
 * the full-page search results. Both surfaces used to duplicate the query
 * definition and the analytics effect, which caused double `search_performed`
 * events when both were mounted and URL drift when only one was kept in sync.
 *
 * The analytics effect fires `trackSearchPerformed` exactly once per settled
 * query string: it tracks the last-tracked query in a local signal and skips
 * if the current query equals it, so refetches (stale-time expiry, window
 * refocus) and type-then-delete-back-to-the-same-term do not double-fire.
 */
export function useSearchStorefront(
	query: () => string,
	options?: UseSearchStorefrontOptions,
): UseSearchStorefrontResult {
	const minQueryLength = options?.minQueryLength ?? 2;
	const limit = options?.limit ?? 8;

	const searchQuery = useQuery(
		() => ({
			enabled: query().length >= minQueryLength,
			queryFn: async ({ queryKey }) => {
				const [, term, requestLimit] = queryKey;
				const data =
					term.length < minQueryLength
						? {
								brands: [],
								categories: [],
								products: [],
							}
						: await api.product.searchStorefront.query({
								limit: requestLimit,
								query: term,
							});

				return { data, term } satisfies {
					data: SearchStorefrontData;
					term: string;
				};
			},
			queryKey: ["search-storefront", query(), limit] as const,
			staleTime: 1000 * 60 * 5,
		}),
		() => queryClient,
	);

	const currentData = () => {
		const result = searchQuery.data;
		return result?.term === query() ? result.data : undefined;
	};

	const [lastTrackedQuery, setLastTrackedQuery] = createSignal<string | null>(null);
	const [trackedSearch, setTrackedSearch] = createSignal<{
		id: string;
		term: string;
	} | null>(null);

	createEffect(() => {
		const term = query();
		const data = currentData();
		if (
			term.length >= minQueryLength &&
			data &&
			!searchQuery.isFetching &&
			lastTrackedQuery() !== term
		) {
			const searchId = crypto.randomUUID();
			trackSearchPerformed(
				term,
				data.products.length,
				searchId,
				data.products.map(({ id }) => id),
			);
			setTrackedSearch({ id: searchId, term });
			setLastTrackedQuery(term);
		}
	});

	return {
		data: currentData,
		fetchStatus: () => searchQuery.fetchStatus,
		isError: () => searchQuery.isError,
		isFetching: () => searchQuery.isFetching,
		isLoading: () => searchQuery.isLoading,
		isLoadingError: () => searchQuery.isLoadingError,
		isRefetchError: () => searchQuery.isRefetchError,
		refetch: () => searchQuery.refetch(),
		searchId: () => {
			const tracked = trackedSearch();
			return tracked?.term === query() ? tracked.id : null;
		},
		status: () => searchQuery.status,
	};
}
