import { TRPCError } from "@trpc/server";
import { productQueries } from "@vit/api/queries";
import { CACHE_POLICY, inventoryTag, PRODUCTS_TAG, productTag } from "@vit/shared";
import { PRODUCT_SORT_DIRECTIONS } from "@vit/shared/domain/product";
import * as v from "valibot";
import { runProductBenchmark } from "~/lib/benchmark/product-benchmark";
import { markCacheable } from "~/lib/cache/workers-cache";
import { PRODUCT_SEARCH_SORT_FIELDS } from "~/lib/product-search/types";
import { createVerifiedRestockSubscription, subscribeVerifiedPhoneToRestock } from "~/lib/restock";
import {
	getGuestRestockChallengeForAttempt,
	requestGuestRestockConfirmation,
	withConfirmedGuestRestockChallenge,
} from "~/lib/restock/challenge";
import { isPhoneVerifiedCustomer } from "~/lib/session/checkout-access";
import { auth } from "~/lib/session/store";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import { projectStorefrontCard } from "~/queries/products/storefront-card";
import {
	mapStockStatus,
	performAssistantProductSearch,
	performProductSearch,
	performProductSearchPage,
	searchNavigationResults,
} from "./product-search-helpers";

const infiniteProductsInput = {
	brandId: v.optional(v.number(), 0),
	categoryId: v.optional(v.number(), 0),
	cursor: v.optional(v.string()),
	limit: v.optional(v.number(), 10),
	listType: v.optional(v.picklist(["featured", "recent", "discount"])),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	requireStock: v.optional(v.boolean(), false),
	searchTerm: v.optional(v.string()),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
};

const paginatedProductsInput = {
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	listType: v.optional(v.picklist(["featured", "recent", "discount"])),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	page: v.pipe(v.number(), v.integer(), v.minValue(1)),
	pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 24),
	requireStock: v.optional(v.boolean(), false),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	sortField: v.optional(v.picklist(["price", "stock", "createdAt"])),
};

const guestRestockContactInput = {
	channel: v.picklist(["sms", "email"]),
	contact: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
};

const guestRestockConfirmationInput = {
	challengeId: v.pipe(v.string(), v.uuid()),
	code: v.pipe(v.string(), v.regex(/^\d{6}$/)),
};

function requestIp(ctx: { c: { req: { header: (name: string) => string | undefined } } }) {
	return (
		ctx.c.req.header("cf-connecting-ip") ??
		ctx.c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown"
	);
}

async function assertProductOutOfStock(productId: number) {
	const product = await productQueries.store.getProductStockStatus(productId);
	if (!product) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
	}
	if (product.status === "draft") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
	}
	if (product.stock > 0) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Product is already in stock",
		});
	}
	return product;
}

const inventoryInput = {
	productIds: v.pipe(
		v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
		v.minLength(1),
		v.maxLength(100),
	),
};

const searchInput = {
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	limit: v.optional(v.number(), 8),
	query: v.pipe(v.string(), v.minLength(1)),
	requireStock: v.optional(v.boolean(), false),
};

const searchPageInput = {
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	maxPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	minPrice: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
	pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 12),
	query: v.pipe(v.string(), v.minLength(1)),
	requireStock: v.optional(v.boolean(), false),
	sortDirection: v.optional(v.picklist(PRODUCT_SORT_DIRECTIONS)),
	sortField: v.optional(v.picklist(PRODUCT_SEARCH_SORT_FIELDS)),
};

export const product = router({
	// Catalogue search returns an exact constrained total plus one page. Unlike
	// the lightweight search takeover, this contract never treats a capped
	// result array as the complete matching set.
	confirmGuestRestockSubscription: publicProcedure
		.input(v.object(guestRestockConfirmationInput))
		.mutation(async ({ ctx, input }) => {
			await getGuestRestockChallengeForAttempt({
				challengeId: input.challengeId,
				requestIp: requestIp(ctx),
			});
			return withConfirmedGuestRestockChallenge({
				...input,
				action: (challenge) =>
					createVerifiedRestockSubscription({
						channel: challenge.channel,
						contact: challenge.contact,
						productId: challenge.productId,
					}),
			});
		}),
	getCartCrossSells: publicProcedure
		.input(
			v.object({
				productIds: v.pipe(
					v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
					v.maxLength(20),
				),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const products = await productQueries.store.getCartCrossSells(input.productIds);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "BAD_REQUEST",
					message: "Error getting cart cross-sells",
				});
			}
		}),
	getInfiniteProducts: publicProcedure
		.input(v.object(infiniteProductsInput))
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getInfiniteProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get infinite products",
				});
			}
		}),

	getInventory: publicProcedure.input(v.object(inventoryInput)).query(async ({ ctx, input }) => {
		const products = await productQueries.store.getProductInventory(input.productIds);
		markCacheable(
			ctx,
			CACHE_POLICY.inventory,
			products.map((product) => inventoryTag(product.id)),
		);
		return products;
	}),

	getPaginatedProducts: publicProcedure
		.input(v.object(paginatedProductsInput))
		.query(async ({ ctx, input }) => {
			try {
				const q = productQueries.store;
				const products = await q.getPaginatedProducts(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get paginated products",
				});
			}
		}),

	getPrerenderCatalog: publicProcedure.query(async ({ ctx }) => {
		const q = productQueries.store;
		const products = await q.getPrerenderCatalog();
		markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
		return products;
	}),

	getProductBenchmark: publicProcedure.query(async () => {
		try {
			return await runProductBenchmark();
		} catch (error) {
			throw new TRPCError({
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run benchmark",
			});
		}
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
			markCacheable(ctx, CACHE_POLICY.productDetail, [PRODUCTS_TAG, productTag(input.id)]);
			if (result === null || result === undefined) {
				return null;
			}

			return {
				...result,
				images: result.images.map((image) => ({
					isPrimary: image.isPrimary,
					url: image.url,
				})),
				stock: result.stock,
			};
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
					amount: product.amount ?? "",
					brand: product.brand?.name ?? "",
					category: product.category?.name ?? "",
					dailyIntake: product.dailyIntake ?? 0,
					description: product.description ?? "",
					id: product.id,
					ingredients: product.ingredients ?? [],
					name: product.name,
					potency: product.potency ?? "",
					price: product.price,
				}));
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
					brand: product.brand?.name || "",
					id: product.id,
					image: product.images[0]?.url || "",
					name: product.name,
					price: product.price,
					slug: product.slug,
					stockStatus: mapStockStatus(product.status, product.stock),
				}));
		}),

	getProductsForHome: publicProcedure.query(async ({ ctx }) => {
		try {
			const q = productQueries.store;
			const [featuredProducts, newProducts, discountedProducts] = await Promise.all([
				q.getFeaturedProducts(),
				q.getNewProducts(),
				q.getDiscountedProducts(),
			]);
			markCacheable(ctx, CACHE_POLICY.homeFeed, [PRODUCTS_TAG]);
			return {
				discountedProducts: discountedProducts.map(projectStorefrontCard),
				featuredProducts: featuredProducts.map(projectStorefrontCard),
				newProducts: newProducts.map(projectStorefrontCard),
			};
		} catch (error) {
			throw new TRPCError({
				cause: error,
				code: "BAD_REQUEST",
				message: "Error getting products for home",
			});
		}
	}),

	getRecommendedProducts: publicProcedure
		.input(
			v.object({
				brandId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				categoryId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const products = await productQueries.store.getRecommendations(input);
				markCacheable(ctx, CACHE_POLICY.productsList, [PRODUCTS_TAG]);
				return products;
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "BAD_REQUEST",
					message: "Error getting recommended products",
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
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to get total product count",
			});
		}
	}),

	requestGuestRestockConfirmation: publicProcedure
		.input(v.object(guestRestockContactInput))
		.mutation(async ({ ctx, input }) => {
			await assertProductOutOfStock(input.productId);
			return requestGuestRestockConfirmation({
				...input,
				requestIp: requestIp(ctx),
			});
		}),

	restockSubscriptionIdentity: publicProcedure.query(async ({ ctx }) => {
		const session = await auth(ctx);
		if (!session || !isPhoneVerifiedCustomer({ ...ctx, session })) {
			return null;
		}
		const phone = String(session.user.phone);
		return { maskedPhone: `••••${phone.slice(-4)}` };
	}),
	searchProductsForAssistant: publicProcedure
		.input(v.object(searchInput))
		.query(async ({ input }) => {
			try {
				return await performAssistantProductSearch(input.query, input.limit, {
					brandId: input.brandId,
					categoryId: input.categoryId,
				});
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
				});
			}
		}),

	searchProductsForPage: publicProcedure
		.input(v.object(searchPageInput))
		.query(async ({ input }) => {
			try {
				const sort =
					input.sortField && input.sortDirection
						? { direction: input.sortDirection, field: input.sortField }
						: undefined;
				return await performProductSearchPage({
					filters: {
						brandId: input.brandId,
						categoryId: input.categoryId,
						maxPrice: input.maxPrice,
						minPrice: input.minPrice,
						requireStock: input.requireStock,
					},
					page: input.page,
					pageSize: input.pageSize,
					query: input.query,
					sort,
				});
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search products",
				});
			}
		}),

	searchStorefront: publicProcedure
		.input(
			v.object({
				limit: v.optional(v.number(), 8),
				query: v.pipe(v.string(), v.minLength(1)),
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
					brands: navigation.brands,
					categories: navigation.categories,
					products,
				};
			} catch (error) {
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to search storefront",
				});
			}
		}),

	subscribeToRestock: verifiedCustomerProcedure
		.input(
			v.object({
				productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		)
		.mutation(({ ctx, input }) => {
			return subscribeVerifiedPhoneToRestock({
				productId: input.productId,
				requestIp: requestIp(ctx),
				verifiedPhone: String(ctx.session.user.phone),
			});
		}),
});
