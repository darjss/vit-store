import { Search } from "@upstash/search";
import type { ProductSelectType } from "../db/schema";

export const syncProductToUpstash = async (
	product: ProductSelectType,
	brandName: string,
	categoryName: string,
	images?: string[],
) => {
	const client = new Search({
		url: "https://suited-joey-76189-eu1-search.upstash.io",
		token:
			"ABUFMHN1aXRlZC1qb2V5LTc2MTg5LWV1MWFkbWluT0RnMlpEUmlOakV0T0dNNU5pMDBOakZoTFdJMU1ESXRNakEyWkRKak1qSTNNemd3",
	});

	await client.index("products").upsert({
		id: `product-${product.id}`,
		content: {
			// Searchable text - includes both English and Mongolian names
			name: `${product.name} ${product.name_mn || ""}`.trim(),
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
			image: images?.[0] || "",
		},
	});
};
