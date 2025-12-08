import { Search } from "@upstash/search";

// Singleton search client
let searchClient: Search | null = null;

export const getSearchClient = () => {
	if (!searchClient) {
		searchClient = new Search({
			url: "https://suited-joey-76189-eu1-search.upstash.io",
			token:
				"ABUFMHN1aXRlZC1qb2V5LTc2MTg5LWV1MWFkbWluT0RnMlpEUmlOakV0T0dNNU5pMDBOakZoTFdJMU1ESXRNakEyWkRKak1qSTNNemd3",
		});
	}
	return searchClient;
};

export interface SearchProductResult {
	id: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	image: string;
}

interface UpstashProductMetadata {
	productId: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	category: string;
	image: string;
}

/**
 * Search products using Upstash Search
 * Returns all data needed for display directly from Upstash (no DB refetch)
 */
export const searchProducts = async (
	query: string,
	limit = 10,
): Promise<SearchProductResult[]> => {
	try {
		const client = getSearchClient();
		const results = await client.index("products").search({
			query,
			limit,
		});

		return results.map((result) => {
			const metadata = result.metadata as UpstashProductMetadata | undefined;

			return {
				id:
					metadata?.productId ??
					Number.parseInt(result.id.replace("product-", ""), 10),
				name: metadata?.name || "",
				slug: metadata?.slug || "",
				price: metadata?.price || 0,
				brand: metadata?.brand || "",
				image: metadata?.image || "",
			};
		});
	} catch (error) {
		console.error("Upstash search error:", error);
		return [];
	}
};

/**
 * Delete a product from the search index
 */
export const deleteProductFromSearch = async (productId: number) => {
	try {
		const client = getSearchClient();
		await client.index("products").delete([`product-${productId}`]);
	} catch (error) {
		console.error("Error deleting product from search:", error);
	}
};
