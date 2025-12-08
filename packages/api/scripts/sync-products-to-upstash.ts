import type { ProductSelectType } from "../src/db/schema";
import { syncProductToUpstash } from "../src/lib/upstash-sync";

interface JsonProduct {
	name: string;
	description: string;
	brand: string;
	slug: string;
	price: number;
	name_mn?: string;
	images?: string[];
	[key: string]: unknown;
}

async function main() {
	const jsonPath = `${process.cwd()}/products-translated-final-final.json`;
	console.log(`Reading products from ${jsonPath}...`);

	const file = Bun.file(jsonPath);
	const products: JsonProduct[] = await file.json();

	console.log(`Found ${products.length} products to sync`);

	let successCount = 0;
	let errorCount = 0;

	for (let i = 0; i < products.length; i++) {
		const jsonProduct = products[i];

		try {
			// Map JSON product to ProductSelectType format
			const product = {
				id: i + 1,
				name: jsonProduct.name,
				slug: jsonProduct.slug,
				price: jsonProduct.price,
				name_mn: jsonProduct.name_mn || null,
				description: jsonProduct.description || "",
			} as ProductSelectType;

			const brandName = jsonProduct.brand || "Unknown";
			const categoryName = "";
			const images = Array.isArray(jsonProduct.images)
				? jsonProduct.images
				: [];

			await syncProductToUpstash(product, brandName, categoryName, images);
			successCount++;

			// Small delay to avoid rate limiting
			if ((i + 1) % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			if ((i + 1) % 100 === 0) {
				console.log(`Progress: ${i + 1}/${products.length} products synced`);
			}
		} catch (error) {
			errorCount++;
			console.error(
				`Error syncing product ${i + 1} (${jsonProduct.name}):`,
				error,
			);
		}
	}

	console.log("\nSync complete!");
	console.log(`Success: ${successCount}`);
	console.log(`Errors: ${errorCount}`);
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
