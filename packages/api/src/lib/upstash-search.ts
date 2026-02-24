import { env } from "cloudflare:workers";
import { Search } from "@upstash/search";
import { logger } from "./logger";

let searchClient: Search | null = null;

export const getSearchClient = () => {
	if (!searchClient) {
		searchClient = new Search({
			url: env.UPSTASH_SEARCH_URL,
			token: env.UPSTASH_SEARCH_TOKEN,
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

export interface SearchProductsFilters {
	brandId?: number;
	categoryId?: number;
}

interface UpstashProductMetadata {
	productId: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	category: string;
	brandId?: number;
	categoryId?: number;
	image: string;
}

interface UpstashProductDocument {
	id: number;
	name: string;
	description?: string | null;
	slug: string;
	price: number;
	brand: string;
	category: string;
	brandId?: number;
	categoryId?: number;
	image?: string;
}

/**
 * Search products using Upstash Search
 * Returns all data needed for display directly from Upstash (no DB refetch)
 */
export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: SearchProductsFilters,
): Promise<SearchProductResult[]> => {
	try {
		const client = getSearchClient();
		const filterParts: string[] = [];
		if (filters?.brandId != null) {
			filterParts.push(`@metadata.brandId = ${filters.brandId}`);
		}
		if (filters?.categoryId != null) {
			filterParts.push(`@metadata.categoryId = ${filters.categoryId}`);
		}
		const filter =
			filterParts.length > 0 ? filterParts.join(" AND ") : undefined;
		const results = await client.index("products").search({
			query,
			limit,
			filter,
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
		logger.error("upstash.search.error", error);
		return [];
	}
};

/**
 * Upsert a product into the search index
 */
export const upsertProductToSearch = async (
	product: UpstashProductDocument,
) => {
	try {
		const client = getSearchClient();
		await client.index("products").upsert({
			id: `product-${product.id}`,
			content: {
				name: product.name,
				description: product.description || "",
			},
			metadata: {
				productId: product.id,
				name: product.name,
				slug: product.slug,
				price: product.price,
				brand: product.brand,
				category: product.category,
				brandId: product.brandId,
				categoryId: product.categoryId,
				image: product.image || "",
			},
		});
	} catch (error) {
		logger.error("upstash.upsert.error", error);
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
		logger.error("upstash.delete.error", error);
	}
};
