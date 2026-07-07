import { TRPCError } from "@trpc/server";
import {
	brandQueries,
	categoryQueries,
	productQueries,
} from "@vit/api/queries";
import { CACHE_POLICY, PRODUCTS_TAG, productTag } from "@vit/shared";
import * as v from "valibot";
import { runCacheBenchmarkV2 } from "~/lib/benchmark/cache-benchmark-v2";
import { runProductBenchmark } from "~/lib/benchmark/product-benchmark";
import { markCacheable } from "~/lib/cache/workers-cache";
import {
	rebuildProductSearchIndex,
	searchProducts,
} from "~/lib/product-search/client";
import {
	normalizeSearchText,
	transliterateCyrillicToLatin,
} from "~/lib/product-search/text";
import { redis } from "~/lib/redis";
import { adminProcedure, publicProcedure, router } from "~/lib/trpc";

export interface SearchProductResult {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stock: number;
	discount: number;
	categoryId?: number;
}

export interface AssistantProductResult {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stockStatus: "in_stock" | "low_stock" | "out_of_stock";
}

const mapStockStatus = (
	status: string,
	stock: number,
): AssistantProductResult["stockStatus"] => {
	if (status === "out_of_stock" || stock <= 0) {
		return "out_of_stock";
	}

	if (stock <= 5) {
		return "low_stock";
	}

	return "in_stock";
};

// Rich catalog row carrying the real stock state from whichever source served
// the query (MiniSearch index or the DB name fallback). Both call sites below
// project this down — the storefront drops stock, the assistant maps it — so
// the two-phase search control flow lives in exactly one place.
interface CatalogSearchRow {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	status: string;
	stock: number;
	discount: number;
	categoryId?: number;
}

const performCatalogSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<CatalogSearchRow[]> => {
	const requireStock = options?.requireStock ?? false;
	const safeLimit = Math.min(limit, 10);
	const filters =
		options?.brandId || options?.categoryId
			? { brandId: options.brandId, categoryId: options.categoryId }
			: undefined;
	const searchResults = await searchProducts(query, safeLimit, filters);

	if (searchResults.length > 0) {
		return searchResults
			.filter((result) => result.status === "active")
			.filter((result) =>
				requireStock ? result.inStock && result.stock > 0 : true,
			)
			.map((result) => ({
				id: result.id,
				slug: result.slug,
				name: result.name,
				price: result.price,
				image: result.image,
				brand: result.brand,
				status: result.status,
				stock: result.stock,
				discount: result.discount,
				categoryId: result.categoryId,
			}));
	}

	const q = productQueries.store;
	const fallbackResults = requireStock
		? await q.searchByNameWithStock(query, safeLimit)
		: await q.searchByName(query, safeLimit);

	return fallbackResults.map((p) => ({
		id: p.id,
		slug: p.slug,
		name: p.name,
		price: p.price,
		image: p.images[0]?.url || "",
		brand: p.brand?.name || "",
		status: p.status,
		stock: p.stock,
		discount: p.discount,
		categoryId: p.categoryId,
	}));
};

const performProductSearch = async (
	query: string,
	limit: number,
	options?: {
		brandId?: number;
		categoryId?: number;
		requireStock?: boolean;
	},
): Promise<SearchProductResult[]> =>
	(await performCatalogSearch(query, limit, options)).map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		price: row.price,
		image: row.image,
		brand: row.brand,
		stock: row.stock,
		discount: row.discount,
		categoryId: row.categoryId,
	}));

const performProductSearchWithStock = async (
	query: string,
	limit: number,
	filters?: { brandId?: number; categoryId?: number },
) => performProductSearch(query, limit, { ...filters, requireStock: true });

// Assistant-facing search: same catalog search as the storefront, but keeps
// the real stock state (mapped via mapStockStatus, including the DB fallback)
// so the Messenger assistant renders accurate stock on product cards and
// surfaces out-of-stock items as alternatives instead of mislabeling them.
const performAssistantProductSearch = async (
	query: string,
	limit: number,
	filters?: { brandId?: number; categoryId?: number },
): Promise<AssistantProductResult[]> =>
	(await performCatalogSearch(query, limit, filters)).map((row) => ({
		id: row.id,
		slug: row.slug,
		name: row.name,
		price: row.price,
		image: row.image,
		brand: row.brand,
		stockStatus: mapStockStatus(row.status, row.stock),
	}));

const GENERIC_PRODUCT_SEARCH_TERMS = new Set([
	"vitamin",
	"vitamins",
	"vit",
	"supplement",
	"supplements",
]);

const scoreNavigationMatch = (
	name: string,
	query: string,
	options?: { ignoreGenericTerms?: boolean },
) => {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return 0;

	const terms = normalizedQuery
		.split(" ")
		.filter((term) => term.length >= 2)
		.filter(
			(term) =>
				!options?.ignoreGenericTerms || !GENERIC_PRODUCT_SEARCH_TERMS.has(term),
		);
	if (terms.length === 0) return 0;

	return Math.max(
		...Array.from(
			new Set([
				normalizeSearchText(name),
				normalizeSearchText(transliterateCyrillicToLatin(name)),
			]),
		).map((normalizedName) => {
			if (!normalizedName) return 0;
			const nameTokens = normalizedName.split(" ");
			let score = 0;

			if (normalizedName === normalizedQuery) score += 1000;
			if (normalizedQuery.includes(normalizedName)) score += 900;
			if (normalizedName.startsWith(normalizedQuery)) score += 700;
			if (normalizedName.includes(normalizedQuery)) score += 500;

			for (const term of terms) {
				if (nameTokens.includes(term)) score += 120;
				else if (nameTokens.some((token) => token.startsWith(term)))
					score += 80;
				else if (normalizedName.includes(term)) score += 40;
			}

			return score;
		}),
	);
};

const searchNavigationResults = async (query: string, limit: number) => {
	const [brands, categories] = await Promise.all([
		brandQueries.store.getAllBrands(),
		categoryQueries.store.getAllCategories(),
	]);
	const safeLimit = Math.min(Math.max(limit, 1), 8);

	return {
		brands: brands
			.map((brand) => ({
				id: brand.id,
				name: brand.name,
				slug: brand.slug,
				type: "brand" as const,
				productCount: brand.productCount,
				logoUrl: brand.logoUrl,
				score: scoreNavigationMatch(brand.name, query, {
					ignoreGenericTerms: true,
				}),
			}))
			.filter((brand) => brand.score > 0 && brand.productCount > 0)
			.sort(
				(a, b) =>
					b.score - a.score ||
					(b.productCount ?? 0) - (a.productCount ?? 0) ||
					a.name.localeCompare(b.name),
			)
			.slice(0, safeLimit)
			.map(({ score: _score, ...brand }) => brand),
		categories: categories
			.map((category) => ({
				id: category.id,
				name: category.name,
				slug: category.slug,
				type: "category" as const,
				productCount: category.productCount,
				score: scoreNavigationMatch(category.name, query),
			}))
			.filter((category) => category.score > 0 && category.productCount > 0)
			.sort(
				(a, b) =>
					b.score - a.score ||
					(b.productCount ?? 0) - (a.productCount ?? 0) ||
					a.name.localeCompare(b.name),
			)
			.slice(0, safeLimit)
			.map(({ score: _score, ...category }) => category),
	};
};

export const product = router({
	searchProducts: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await performProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	searchProductsForPage: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await performProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	searchStorefront: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ input }) => {
			try {
				const safeLimit = Math.min(input.limit, 12);
				const [products, navigation] = await Promise.all([
					performProductSearch(input.query, safeLimit),
					searchNavigationResults(input.query, 4),
				]);

				return {
					products,
					brands: navigation.brands,
					categories: navigation.categories,
				};
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search storefront",
					cause: error,
				});
			}
		}),

	searchProductsWithStock: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await performProductSearchWithStock(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	searchProductsForPageWithStock: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await performProductSearchWithStock(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),

	searchStorefrontWithStock: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
			}),
		)
		.query(async ({ input }) => {
			try {
				const safeLimit = Math.min(input.limit, 12);
				const [products, navigation] = await Promise.all([
					performProductSearchWithStock(input.query, safeLimit),
					searchNavigationResults(input.query, 4),
				]);

				return {
					products,
					brands: navigation.brands,
					categories: navigation.categories,
				};
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search storefront",
					cause: error,
				});
			}
		}),

	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					q.getFeaturedProducts(),
					q.getNewProducts(),
					q.getDiscountedProducts(),
				]);
			markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
			return {
				featuredProducts: featuredProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				newProducts: newProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				discountedProducts: discountedProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					discount: product.discount,
					stock: product.stock,
				})),
			};
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error getting products for home",
				cause: error,
			});
		}
	}),

	getProductsForHomeWithStock: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const [featuredProducts, newProducts, discountedProducts] =
				await Promise.all([
					q.getFeaturedProductsWithStock(),
					q.getNewProductsWithStock(),
					q.getDiscountedProductsWithStock(),
				]);
			markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
			return {
				featuredProducts: featuredProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				newProducts: newProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					stock: product.stock,
				})),
				discountedProducts: discountedProducts.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url,
					brand: product.brand.name,
					discount: product.discount,
					stock: product.stock,
				})),
			};
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error getting products for home",
				cause: error,
			});
		}
	}),

	getAllProducts: publicProcedure.query(async ({ ctx }) => {
		const q = productQueries.store;
		const products = await q.getAllProducts();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return products;
	}),
	getPrerenderProducts: publicProcedure.query(async ({ ctx }) => {
		const q = productQueries.store;
		const products = await q.getPrerenderProducts();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return products;
	}),
	getProductById: publicProcedure
		.input(
			v.object({
				id: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const q = productQueries.store;
			const result = await q.getProductById(input.id);
			markCacheable(ctx, CACHE_POLICY.productDetail, [
				PRODUCTS_TAG,
				productTag(input.id),
			]);
			if (result === null || result === undefined) {
				return null;
			}

			return {
				...result,
				stock: result.stock,
				images: result.images.map((image) => ({
					url: image.url,
					isPrimary: image.isPrimary,
				})),
			};
		}),
	getProductsByIds: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ ctx, input }) => {
			const q = productQueries.store;
			const result = await q.getProductsByIds(input.ids);
			markCacheable(ctx, CACHE_POLICY.productsList, [
				PRODUCTS_TAG,
				...input.ids.map((id) => productTag(id)),
			]);
			return result.map((product) => ({
				id: product.id,
				name: product.name,
				price: product.price,
				image: product.images[0]?.url,
			}));
		}),
	searchProductsForAssistant: publicProcedure
		.input(
			v.object({
				query: v.pipe(v.string(), v.minLength(1)),
				limit: v.optional(v.number(), 8),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			try {
				return await performAssistantProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
					cause: error,
				});
			}
		}),
	getProductsByIdsForAssistant: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			const q = productQueries.store;
			const results = await q.getProductsByIdsWithDetails(input.ids);
			const byId = new Map(results.map((product) => [product.id, product]));

			return input.ids
				.map((id) => byId.get(id))
				.filter((product): product is NonNullable<typeof product> => !!product)
				.map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url || "",
					brand: product.brand?.name || "",
					stockStatus: mapStockStatus(product.status, product.stock),
				}));
		}),
	getProductsByIdsForAdvice: publicProcedure
		.input(
			v.object({
				ids: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
			}),
		)
		.query(async ({ input }) => {
			const q = productQueries.store;
			const results = await q.getProductsByIdsForAdvice(input.ids);
			const byId = new Map(results.map((product) => [product.id, product]));

			return input.ids
				.map((id) => byId.get(id))
				.filter((product): product is NonNullable<typeof product> => !!product)
				.map((product) => ({
					id: product.id,
					name: product.name,
					brand: product.brand?.name ?? "",
					category: product.category?.name ?? "",
					description: product.description ?? "",
					ingredients: product.ingredients ?? [],
					amount: product.amount ?? "",
					potency: product.potency ?? "",
					dailyIntake: product.dailyIntake ?? 0,
					price: product.price,
				}));
		}),
	getRecommendedProducts: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				categoryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				brandId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const [sameCategory, sameBrand] = await Promise.all([
					q.getRecommendedProductsByCategory(input.categoryId, input.productId),
					q.getRecommendedProductsByBrand(input.brandId, input.productId),
				]);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);

				const allProducts = [...sameCategory, ...sameBrand];
				const uniqueProducts = allProducts.filter(
					(product, index, self) =>
						index === self.findIndex((p) => p.id === product.id),
				);

				return uniqueProducts.slice(0, 5).map((product) => ({
					id: product.id,
					slug: product.slug,
					name: product.name,
					price: product.price,
					image: product.images[0]?.url || "",
					brand: product.brand.name,
					discount: product.discount,
					stock: product.stock,
				}));
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error getting recommended products",
					cause: error,
				});
			}
		}),
	isProductInStock: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			const q = productQueries.store;
			const product = await q.getProductStockStatus(input.productId);
			if (product === null || product === undefined) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Product not found",
				});
			}
			markCacheable(ctx, CACHE_POLICY.productDetail, [
				PRODUCTS_TAG,
				productTag(input.productId),
			]);
			if (product.stock === 0 || product.status === "out_of_stock") {
				return {
					isInStock: false,
					stock: product.stock,
				};
			}
			return {
				isInStock: true,
				stock: product.stock,
			};
		}),
	subscribeToRestock: publicProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				channel: v.picklist(["sms", "email"]),
				contact: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
			}),
		)
		.mutation(async ({ input }) => {
			const q = productQueries.store;
			const product = await q.getProductStockStatus(input.productId);

			if (!product) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Product not found",
				});
			}

			if (product.stock > 0 && product.status !== "out_of_stock") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Product is already in stock",
				});
			}

			const normalizedContact =
				input.channel === "sms"
					? input.contact.replace(/\D/g, "")
					: input.contact.trim().toLowerCase();

			if (input.channel === "sms" && !/^[6-9]\d{7}$/.test(normalizedContact)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid phone number",
				});
			}

			if (
				input.channel === "email" &&
				!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContact)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Invalid email address",
				});
			}

			const subscriberId = `${input.channel}:${normalizedContact}`;
			const productSubscribersKey = `restock:subs:${input.productId}`;
			const subscriberDataKey = `restock:sub:${input.productId}:${subscriberId}`;

			await redis().sadd(productSubscribersKey, subscriberId);
			await redis().set(
				subscriberDataKey,
				JSON.stringify({
					productId: input.productId,
					channel: input.channel,
					contact: normalizedContact,
					createdAt: new Date().toISOString(),
				}),
				{ ex: 60 * 60 * 24 * 30 },
			);

			await redis().sadd("restock:watch:products", String(input.productId));

			return {
				success: true,
				message: "Subscription created",
			};
		}),
	getProductBenchmark: publicProcedure.query(async () => {
		try {
			return await runProductBenchmark();
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run benchmark",
				cause: error,
			});
		}
	}),
	getCacheBenchmarkV2: publicProcedure
		.input(
			v.optional(
				v.object({
					iterations: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(100)),
						12,
					),
					warmup: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)),
						2,
					),
				}),
			),
		)
		.query(async ({ input }) => {
			try {
				return await runCacheBenchmarkV2(input ?? undefined);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to run cache benchmark",
					cause: error,
				});
			}
		}),
	getInfiniteProducts: publicProcedure
		.input(
			v.object({
				cursor: v.optional(v.string()),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.number(), 0),
				categoryId: v.optional(v.number(), 0),
				listType: v.optional(v.picklist(["featured", "recent", "discount"])),
				searchTerm: v.optional(v.string()),
				sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;

				const products = await q.getInfiniteProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get infinite products",
					cause: error,
				});
			}
		}),
	getPaginatedProducts: publicProcedure
		.input(
			v.object({
				page: v.pipe(v.number(), v.integer(), v.minValue(1)),
				pageSize: v.optional(
					v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
					24,
				),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getPaginatedProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get paginated products",
					cause: error,
				});
			}
		}),

	getInfiniteProductsWithStock: publicProcedure
		.input(
			v.object({
				cursor: v.optional(v.string()),
				limit: v.optional(v.number(), 10),
				brandId: v.optional(v.number(), 0),
				categoryId: v.optional(v.number(), 0),
				listType: v.optional(v.picklist(["featured", "recent", "discount"])),
				searchTerm: v.optional(v.string()),
				sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getInfiniteProductsWithStock(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get infinite products",
					cause: error,
				});
			}
		}),

	getPaginatedProductsWithStock: publicProcedure
		.input(
			v.object({
				page: v.pipe(v.number(), v.integer(), v.minValue(1)),
				pageSize: v.optional(
					v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
					24,
				),
				brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
				sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
				sortDirection: v.optional(v.picklist(["asc", "desc"])),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getPaginatedProductsWithStock(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get paginated products",
					cause: error,
				});
			}
		}),

	getTotalActiveProductCount: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const count = await q.getTotalActiveProductCount();
			markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
			return count;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get total product count",
				cause: error,
			});
		}
	}),

	rebuildSearchIndex: adminProcedure.mutation(async () => {
		try {
			const status = await rebuildProductSearchIndex("manual");
			return status;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to rebuild search index",
				cause: error,
			});
		}
	}),
});
