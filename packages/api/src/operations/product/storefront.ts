import { productQueries } from "~/queries";
import type {
	ProductDetail,
	ProductLookupError,
	ProductSearchPage,
	SearchUnavailable,
	StorefrontSearch,
} from "@vit/shared";
import { Result } from "better-result";
import { productErrors } from "~/errors/factories/product";
import { ProductSearchUnavailableError } from "~/lib/product-search/client";
import { projectStorefrontCard } from "~/queries/products/storefront-card";
import {
	performProductSearch,
	performProductSearchPage,
	searchNavigationResults,
} from "~/routers/store/product-search-helpers";
import type {
	ProductSearchFilters,
	ProductSearchSort,
} from "~/lib/product-search/types";

const storeProductQueries = productQueries.store;

export const getHomeProductsOperation = async () => {
	const [featuredProducts, newProducts, discountedProducts] = await Promise.all(
		[
			storeProductQueries.getFeaturedProducts(),
			storeProductQueries.getNewProducts(),
			storeProductQueries.getDiscountedProducts(),
		],
	);
	return {
		featuredProducts: featuredProducts.map(projectStorefrontCard),
		newProducts: newProducts.map(projectStorefrontCard),
		discountedProducts: discountedProducts.map(projectStorefrontCard),
	};
};

export const getProductByIdOperation = async (
	id: number,
	queries: Pick<
		typeof storeProductQueries,
		"getProductById" | "getProductStockStatus"
	> = storeProductQueries,
) => {
	const product = await queries.getProductById(id);
	if (product) {
		return Result.ok<ProductDetail, ProductLookupError>({
			...product,
			images: product.images.map((image) => ({
				url: image.url,
				isPrimary: image.isPrimary,
			})),
		});
	}

	const stockStatus = await queries.getProductStockStatus(id);
	if (!stockStatus) {
		return Result.err<ProductDetail, ProductLookupError>(
			productErrors.notFound(),
		);
	}
	if (stockStatus.status !== "active") {
		return Result.err<ProductDetail, ProductLookupError>(
			productErrors.unavailable(),
		);
	}

	throw new Error("Active product disappeared between storefront reads");
};

export const getProductInventoryOperation = (productIds: number[]) =>
	storeProductQueries.getProductInventory(productIds);

export const getInfiniteProductsOperation = (
	input: Parameters<typeof storeProductQueries.getInfiniteProducts>[0],
) => storeProductQueries.getInfiniteProducts(input);

export const getPaginatedProductsOperation = (
	input: Parameters<typeof storeProductQueries.getPaginatedProducts>[0],
) => storeProductQueries.getPaginatedProducts(input);

export const getTotalActiveProductCountOperation = () =>
	storeProductQueries.getTotalActiveProductCount();

export const getRecommendedProductsOperation = (input: {
	productId: number;
	categoryId: number;
	brandId: number;
}) => storeProductQueries.getRecommendations(input);

export const searchProductsForPageOperation = async (
	input: {
		query: string;
		page: number;
		pageSize: number;
		filters?: ProductSearchFilters;
		sort?: ProductSearchSort;
	},
	search: typeof performProductSearchPage = performProductSearchPage,
) => {
	try {
		return Result.ok<ProductSearchPage, SearchUnavailable>(await search(input));
	} catch (error) {
		if (error instanceof ProductSearchUnavailableError) {
			return Result.err<ProductSearchPage, SearchUnavailable>(
				productErrors.searchUnavailable(),
			);
		}
		throw error;
	}
};

export const searchStorefrontOperation = async (
	input: { query: string; limit: number },
	searchProductsForStorefront: typeof performProductSearch = performProductSearch,
	searchNavigation: typeof searchNavigationResults = searchNavigationResults,
) => {
	try {
		const safeLimit = Math.min(input.limit, 12);
		const [products, navigation] = await Promise.all([
			searchProductsForStorefront(input.query, safeLimit),
			searchNavigation(input.query, 4),
		]);
		return Result.ok<StorefrontSearch, SearchUnavailable>({
			products,
			brands: navigation.brands,
			categories: navigation.categories,
		});
	} catch (error) {
		if (error instanceof ProductSearchUnavailableError) {
			return Result.err<StorefrontSearch, SearchUnavailable>(
				productErrors.searchUnavailable(),
			);
		}
		throw error;
	}
};
