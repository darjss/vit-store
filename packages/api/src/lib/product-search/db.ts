import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "~/db";
import { BrandsTable, CategoriesTable, ProductImagesTable, ProductsTable } from "~/db/schema";
import {
	buildProductSearchDocument,
	buildProductSearchRankings,
} from "~/lib/product-search/document";
import type {
	ProductSearchAnalyticsSignal,
	ProductSearchDocument,
	ProductSearchSourceDocument,
} from "~/lib/product-search/types";

export const loadProductSearchDocumentsFromDb = async (
	db: DB,
	signals: Array<ProductSearchAnalyticsSignal> = [],
): Promise<Array<ProductSearchDocument>> => {
	const products = await db
		.select({
			amount: ProductsTable.amount,
			brandId: ProductsTable.brandId,
			categoryId: ProductsTable.categoryId,
			createdAt: ProductsTable.createdAt,
			dailyIntake: ProductsTable.dailyIntake,
			description: ProductsTable.description,
			discount: ProductsTable.discount,
			id: ProductsTable.id,
			ingredients: ProductsTable.ingredients,
			isFeatured: ProductsTable.isFeatured,
			name: ProductsTable.name,
			nameMn: ProductsTable.name_mn,
			potency: ProductsTable.potency,
			price: ProductsTable.price,
			slug: ProductsTable.slug,
			status: ProductsTable.status,
			stock: ProductsTable.stock,
			tags: ProductsTable.tags,
		})
		.from(ProductsTable)
		.where(and(isNull(ProductsTable.deletedAt), eq(ProductsTable.status, "active")));

	if (products.length === 0) {
		return [];
	}

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
			.where(eq(ProductImagesTable.isPrimary, true)),
	]);

	const brandMap = new Map(brands.map((b) => [b.id, b.name]));
	const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

	const primaryImageByProduct = new Map<number, string>();
	for (const img of images) {
		if (!primaryImageByProduct.has(img.productId)) {
			primaryImageByProduct.set(img.productId, img.url);
		}
	}

	const sources: Array<ProductSearchSourceDocument> = products.map((product) => ({
		amount: product.amount,
		brand: brandMap.get(product.brandId) ?? "",
		brandId: product.brandId,
		category: categoryMap.get(product.categoryId) ?? "",
		categoryId: product.categoryId,
		createdAt: product.createdAt,
		dailyIntake: product.dailyIntake,
		description: product.description,
		discount: product.discount,
		id: product.id,
		image: primaryImageByProduct.get(product.id) ?? "",
		ingredients: product.ingredients,
		isFeatured: product.isFeatured,
		name: product.name,
		nameMn: product.nameMn,
		potency: product.potency,
		price: product.price,
		slug: product.slug,
		status: product.status,
		stock: product.stock,
		tags: product.tags,
	}));
	const rankingByProduct = buildProductSearchRankings(sources, signals);

	return sources.map((product) =>
		buildProductSearchDocument(product, rankingByProduct.get(product.id)),
	);
};
