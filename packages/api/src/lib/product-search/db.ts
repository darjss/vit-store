import { eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "~/db";
import {
	BrandsTable,
	CategoriesTable,
	ProductImagesTable,
	ProductsTable,
} from "~/db/schema";
import { buildProductSearchDocument } from "~/lib/product-search/core";
import type { ProductSearchDocument } from "~/lib/product-search/types";

export const loadProductSearchDocumentsFromDb = async (
	db: DB,
): Promise<ProductSearchDocument[]> => {
	const products = await db
		.select({
			id: ProductsTable.id,
			name: ProductsTable.name,
			nameMn: ProductsTable.name_mn,
			description: ProductsTable.description,
			slug: ProductsTable.slug,
			price: ProductsTable.price,
			discount: ProductsTable.discount,
			status: ProductsTable.status,
			stock: ProductsTable.stock,
			amount: ProductsTable.amount,
			potency: ProductsTable.potency,
			dailyIntake: ProductsTable.dailyIntake,
			brandId: ProductsTable.brandId,
			categoryId: ProductsTable.categoryId,
			isFeatured: ProductsTable.isFeatured,
			ingredients: ProductsTable.ingredients,
			tags: ProductsTable.tags,
		})
		.from(ProductsTable)
		.where(isNull(ProductsTable.deletedAt));

	if (products.length === 0) return [];

	const brandIds = [...new Set(products.map((p) => p.brandId))];
	const categoryIds = [...new Set(products.map((p) => p.categoryId))];

	const [brands, categories, images] = await Promise.all([
		db
			.select({ id: BrandsTable.id, name: BrandsTable.name })
			.from(BrandsTable)
			.where(inArray(BrandsTable.id, brandIds)),
		db
			.select({ id: CategoriesTable.id, name: CategoriesTable.name })
			.from(CategoriesTable)
			.where(inArray(CategoriesTable.id, categoryIds)),
		db
			.select({
				productId: ProductImagesTable.productId,
				url: ProductImagesTable.url,
			})
			.from(ProductImagesTable)
			.where(
				eq(ProductImagesTable.isPrimary, true),
			),
	]);

	const brandMap = new Map(brands.map((b) => [b.id, b.name]));
	const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

	const primaryImageByProduct = new Map<number, string>();
	for (const img of images) {
		if (!primaryImageByProduct.has(img.productId)) {
			primaryImageByProduct.set(img.productId, img.url);
		}
	}

	return products.map((product) =>
		buildProductSearchDocument({
			id: product.id,
			name: product.name,
			nameMn: product.nameMn,
			description: product.description,
			slug: product.slug,
			price: product.price,
			discount: product.discount,
			brand: brandMap.get(product.brandId) ?? "",
			category: categoryMap.get(product.categoryId) ?? "",
			status: product.status,
			stock: product.stock,
			amount: product.amount,
			potency: product.potency,
			dailyIntake: product.dailyIntake,
			brandId: product.brandId,
			categoryId: product.categoryId,
			isFeatured: product.isFeatured,
			ingredients: product.ingredients,
			tags: product.tags,
			image: primaryImageByProduct.get(product.id) ?? "",
		}),
	);
};
