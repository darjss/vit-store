import { Search } from "@upstash/search";
import type { ProductSelectType } from "../db/schema";
import { logger } from "./logger";

const getSyncSearchClient = () => {
	const url = process.env.UPSTASH_SEARCH_URL;
	const token = process.env.UPSTASH_SEARCH_TOKEN;
	if (!url || !token) {
		throw new Error("UPSTASH_SEARCH_URL and UPSTASH_SEARCH_TOKEN are required");
	}
	return new Search({ url, token });
};

export const syncProductToUpstash = async (
	product: ProductSelectType,
	brandName: string,
	categoryName: string,
	brandId?: number,
	categoryId?: number,
	images?: string[],
) => {
	const client = getSyncSearchClient();

	await client.index("products").upsert({
		id: `product-${product.id}`,
		content: {
			// Searchable text
			name: product.name,
			description: product.description,
		},
		metadata: {
			// All data needed for display (no DB refetch required)
			productId: product.id,
			name: product.name,
			slug: product.slug,
			price: product.price,
			brand: brandName,
			category: categoryName,
			brandId,
			categoryId,
			image: images?.[0] || "",
		},
	});
};

export interface ProductForSync {
	id: number;
	name: string;
	slug: string;
	price: number;
	description: string | null;
	brandId?: number;
	categoryId?: number;
	brand: { name: string } | null;
	category: { name: string } | null;
	images: { url: string }[];
}

/**
 * Bulk sync products to Upstash Search
 * Returns sync statistics
 */
export const bulkSyncProductsToUpstash = async (
	products: ProductForSync[],
): Promise<{ success: number; failed: number; errors: string[] }> => {
	const client = getSyncSearchClient();
	const errors: string[] = [];
	let success = 0;
	let failed = 0;

	const batchSize = 10;
	for (let i = 0; i < products.length; i += batchSize) {
		const batch = products.slice(i, i + batchSize);

		const upsertPromises = batch.map(async (product) => {
			try {
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
						brand: product.brand?.name || "",
						category: product.category?.name || "",
						brandId: product.brandId,
						categoryId: product.categoryId,
						image: product.images[0]?.url || "",
					},
				});
				return { success: true, id: product.id };
			} catch (error) {
				const errorMsg = `Product ${product.id} (${product.name}): ${error instanceof Error ? error.message : "Unknown error"}`;
				return { success: false, id: product.id, error: errorMsg };
			}
		});

		const results = await Promise.all(upsertPromises);

		for (const result of results) {
			if (result.success) {
				success++;
			} else {
				failed++;
				if (result.error) {
					errors.push(result.error);
				}
			}
		}

		// Small delay between batches to avoid rate limiting
		if (i + batchSize < products.length) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	return { success, failed, errors };
};

/**
 * Clear all products from Upstash Search index
 */
export const clearUpstashProductsIndex = async (): Promise<void> => {
	const client = getSyncSearchClient();
	await client.index("products").reset();
	logger.info("clearUpstashProductsIndex", { message: "Index cleared" });
};
