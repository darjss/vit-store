import { brandQueries, categoryQueries } from "~/queries";
import { Result } from "better-result";
import type { CatalogResourceNotFound } from "@vit/shared";
import { productErrors } from "~/errors/factories/product";

export const getAllCategoriesOperation = () =>
	categoryQueries.store.getAllCategories();

export const getAllCategoriesWithStockOperation = () =>
	categoryQueries.store.getAllCategoriesWithStock();

export const getCategoryBySlugOperation = async (slug: string) => {
	const category = await categoryQueries.store.getCategoryBySlug(slug);
	return category
		? Result.ok<typeof category, CatalogResourceNotFound>(category)
		: Result.err<NonNullable<typeof category>, CatalogResourceNotFound>(
				productErrors.catalogResourceNotFound("category"),
			);
};

export const getAllBrandsWithStockOperation = () =>
	brandQueries.store.getAllBrandsWithStock();

export const getBrandBySlugOperation = async (slug: string) => {
	const brand = await brandQueries.store.getBrandBySlug(slug);
	return brand
		? Result.ok<typeof brand, CatalogResourceNotFound>(brand)
		: Result.err<NonNullable<typeof brand>, CatalogResourceNotFound>(
				productErrors.catalogResourceNotFound("brand"),
			);
};
