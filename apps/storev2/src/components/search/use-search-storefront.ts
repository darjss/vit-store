import { useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal } from "solid-js";
import { trackSearchPerformed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

export interface SearchStorefrontData {
	products: {
		id: number;
		slug: string;
		name: string;
		price: number;
		image: string;
		brand: string;
		stock?: number;
		discount?: number;
		categoryId?: number;
	}[];
	brands: {
		id: number;
		name: string;
		slug: string;
		productCount: number;
		logoUrl?: string | null;
	}[];
	categories: {
		id: number;
		name: string;
		slug: string;
		productCount: number;
	}[];
}

export interface UseSearchStorefrontOptions {
	/** Minimum query length before the search fires. */
	minQueryLength?: number;
	/** Result cap passed to the API. */
	limit?: number;
}

export interface UseSearchStorefrontResult {
	data: () => SearchStorefrontData | undefined;
	isLoading: () => boolean;
	isFetching: () => boolean;
	isError: () => boolean;
	refetch: () => void;
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
			queryKey: ["search-storefront", query(), limit] as const,
			queryFn: async ({ queryKey }) => {
				const [, term, requestLimit] = queryKey;
				const data =
					term.length < minQueryLength
						? {
								products: [],
								brands: [],
								categories: [],
							}
						: await api.product.searchStorefront.query({
								query: term,
								limit: requestLimit,
							});

				return { term, data } satisfies {
					term: string;
					data: SearchStorefrontData;
				};
			},
			enabled: query().length >= minQueryLength,
			staleTime: 1000 * 60 * 5,
		}),
		() => queryClient,
	);

	const currentData = () => {
		const result = searchQuery.data;
		return result?.term === query() ? result.data : undefined;
	};

	const [lastTrackedQuery, setLastTrackedQuery] = createSignal<string | null>(
		null,
	);

	createEffect(() => {
		const term = query();
		const data = currentData();
		if (
			term.length >= minQueryLength &&
			data &&
			!searchQuery.isFetching &&
			lastTrackedQuery() !== term
		) {
			trackSearchPerformed(term, data.products.length);
			setLastTrackedQuery(term);
		}
	});

	return {
		data: currentData,
		isLoading: () => searchQuery.isLoading,
		isFetching: () => searchQuery.isFetching,
		isError: () => searchQuery.isError,
		refetch: () => searchQuery.refetch(),
	};
}
