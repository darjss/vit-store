import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	gte,
	ilike,
	inArray,
	isNull,
	lt,
	lte,
	ne,
	notInArray,
	or,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";
import { normalizeSearchText } from "~/lib/product-search/text";
import {
	buildActiveProductConditions,
	rankInStockProducts,
} from "~/queries/products/shared";

const buildNameFallbackCondition = (searchTerm: string): SQLWrapper => {
	const tokens = normalizeSearchText(searchTerm).split(" ").filter(Boolean);
	if (tokens.length === 0) {
		return or(
			ilike(ProductsTable.name, `%${searchTerm}%`),
			ilike(ProductsTable.name_mn, `%${searchTerm}%`),
		) as SQLWrapper;
	}

	const nameNoComma = sql`replace(${ProductsTable.name}, ',', '')`;
	const nameMnNoComma = sql`replace(${ProductsTable.name_mn}, ',', '')`;

	return and(
		...tokens
			.slice(0, 6)
			.map((token) =>
				or(
					ilike(nameNoComma, `%${token}%`),
					ilike(nameMnNoComma, `%${token}%`),
				),
			),
	) as SQLWrapper;
};

import {
	projectStorefrontCard,
	storefrontCardColumns,
	storefrontCardRelations,
	type StorefrontCardRow,
} from "~/queries/products/storefront-card";

const inStockRankExpr = sql`(${ProductsTable.stock} > 0)`;
const inStockFirst = desc(inStockRankExpr);

type StorefrontProductFilters = {
	requireStock?: boolean;
	brandId?: number;
	categoryId?: number;
	listType?: "featured" | "recent" | "discount";
	minPrice?: number;
	maxPrice?: number;
};

const resolveStorefrontProductSort = ({
	listType,
	sortField,
	sortDirection,
}: {
	listType?: "featured" | "recent" | "discount";
	sortField?: "price" | "stock" | "createdAt";
	sortDirection?: "asc" | "desc";
}) => {
	const field = sortField ?? (listType === "recent" ? "createdAt" : "stock");
	const direction = sortDirection ?? "desc";
	const column =
		field === "price"
			? ProductsTable.price
			: field === "stock"
				? ProductsTable.stock
				: ProductsTable.createdAt;
	const isAsc = direction === "asc";
	const prioritizeStock = listType !== "recent" || sortField !== undefined;

	return {
		field,
		column,
		isAsc,
		orderBy: [
			...(prioritizeStock ? [inStockFirst] : []),
			isAsc ? asc(column) : desc(column),
			isAsc ? asc(ProductsTable.id) : desc(ProductsTable.id),
		],
		prioritizeStock,
	};
};

const buildStorefrontProductConditions = ({
	requireStock = false,
	brandId,
	categoryId,
	listType,
	minPrice,
	maxPrice,
}: StorefrontProductFilters): SQL<unknown>[] => {
	const conditions: SQL<unknown>[] = [
		isNull(ProductsTable.deletedAt),
		eq(ProductsTable.status, "active"),
	];
	if (requireStock) conditions.push(gt(ProductsTable.stock, 0));
	if (brandId !== undefined && brandId !== 0) {
		conditions.push(eq(ProductsTable.brandId, brandId));
	}
	if (categoryId !== undefined && categoryId !== 0) {
		conditions.push(eq(ProductsTable.categoryId, categoryId));
	}
	if (minPrice !== undefined) {
		conditions.push(gte(ProductsTable.price, minPrice));
	}
	if (maxPrice !== undefined) {
		conditions.push(lte(ProductsTable.price, maxPrice));
	}
	if (listType === "featured") {
		conditions.push(eq(ProductsTable.isFeatured, true));
	}
	if (listType === "discount") {
		conditions.push(gt(ProductsTable.discount, 0));
	}
	return conditions;
};

const recommendableProductColumns = storefrontCardColumns;
const recommendableProductWith = storefrontCardRelations;

const RECOMMENDATION_LIMIT = 6;
const RECOMMENDATION_OVERSAMPLE = 12;
const CROSS_SELL_INPUT_LIMIT = 20;

const completeRecommendations = (
	products: StorefrontCardRow[],
	excludeIds: Iterable<number>,
	limit: number,
) =>
	rankInStockProducts(products, { excludeIds, limit }).map(
		projectStorefrontCard,
	);

export const storeQueries = {
		async getFeaturedProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: storefrontCardColumns,
				orderBy: desc(ProductsTable.stock),
				limit: 8,
				where: buildActiveProductConditions(requireStock),
				with: storefrontCardRelations,
			});
		},

		async getNewProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: storefrontCardColumns,
				orderBy: [inStockFirst, desc(ProductsTable.updatedAt)],
				limit: 4,
				where: buildActiveProductConditions(requireStock),
				with: storefrontCardRelations,
			});
		},

		async getDiscountedProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: storefrontCardColumns,
				orderBy: [inStockFirst, desc(ProductsTable.updatedAt)],
				limit: 4,
				where: and(
					gt(ProductsTable.discount, 0),
					buildActiveProductConditions(requireStock),
				),
				with: storefrontCardRelations,
			});
		},

		async getAllProducts() {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
				},
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
				),
			});
		},

		async getPrerenderProducts() {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
					stock: true,
					oldSlugs: true,
				},
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					gt(ProductsTable.stock, 0),
				),
			});
		},

		async getProductById(id: number) {
			return db().query.ProductsTable.findFirst({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
					status: true,
					stock: true,
					description: true,
					discount: true,
					amount: true,
					potency: true,
					dailyIntake: true,
					categoryId: true,
					brandId: true,
					ingredients: true,
					weightGrams: true,
					expirationDate: true,
					seoTitle: true,
					seoDescription: true,
				},
				where: and(
					eq(ProductsTable.id, id),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
							isPrimary: true,
						},
					},
					brand: {
						columns: {
							name: true,
						},
					},
					category: {
						columns: {
							name: true,
							slug: true,
						},
					},
				},
			});
		},

		async getProductInventory(productIds: number[]) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					price: true,
					stock: true,
					status: true,
				},
				where: and(
					inArray(ProductsTable.id, productIds),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
			});
		},

		async getProductsByIds(ids: number[]) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
				},
				where: and(
					inArray(ProductsTable.id, ids),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
				},
			});
		},

		async getRecommendedProductsByCategory(
			categoryId: number,
			excludeProductId: number,
			limit = 12,
		) {
			return db().query.ProductsTable.findMany({
				columns: recommendableProductColumns,
				limit,
				where: and(
					eq(ProductsTable.categoryId, categoryId),
					buildActiveProductConditions(true),
					ne(ProductsTable.id, excludeProductId),
				),
				orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
				with: recommendableProductWith,
			});
		},

		async getRecommendedProductsByBrand(
			brandId: number,
			excludeProductId: number,
			limit = 12,
		) {
			return db().query.ProductsTable.findMany({
				columns: recommendableProductColumns,
				limit,
				where: and(
					eq(ProductsTable.brandId, brandId),
					buildActiveProductConditions(true),
					ne(ProductsTable.id, excludeProductId),
				),
				orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
				with: recommendableProductWith,
			});
		},

		async getHighStockFallbackProducts(
			excludeIds: number[],
			limit = 6,
		) {
			return db().query.ProductsTable.findMany({
				columns: recommendableProductColumns,
				limit,
				where: and(
					buildActiveProductConditions(true),
					excludeIds.length > 0
						? notInArray(ProductsTable.id, excludeIds)
						: undefined,
				),
				orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
				with: recommendableProductWith,
			});
		},

		async getProductAffinityKeys(ids: number[]) {
			if (ids.length === 0) return [];
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					categoryId: true,
					brandId: true,
				},
				where: and(
					inArray(ProductsTable.id, ids),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
				),
			});
		},

		async getCrossSellCandidates(options: {
			categoryIds: number[];
			brandIds: number[];
			excludeIds: number[];
			limit?: number;
		}) {
			const { categoryIds, brandIds, excludeIds, limit = 20 } = options;
			const affinityParts = [
				...(categoryIds.length > 0
					? [inArray(ProductsTable.categoryId, categoryIds)]
					: []),
				...(brandIds.length > 0
					? [inArray(ProductsTable.brandId, brandIds)]
					: []),
			];
			if (affinityParts.length === 0) return [];

			const affinity =
				affinityParts.length === 1
					? affinityParts[0]
					: or(...affinityParts);

			return db().query.ProductsTable.findMany({
				columns: recommendableProductColumns,
				limit,
				where: and(
					buildActiveProductConditions(true),
					affinity,
					excludeIds.length > 0
						? notInArray(ProductsTable.id, excludeIds)
						: undefined,
				),
				orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
				with: recommendableProductWith,
			});
		},

		async getRecommendations(input: {
			productId: number;
			categoryId: number;
			brandId: number;
		}) {
			const [sameCategory, sameBrand] = await Promise.all([
				storeQueries.getRecommendedProductsByCategory(
					input.categoryId,
					input.productId,
					RECOMMENDATION_OVERSAMPLE,
				),
				storeQueries.getRecommendedProductsByBrand(
					input.brandId,
					input.productId,
					RECOMMENDATION_OVERSAMPLE,
				),
			]);
			const ranked = completeRecommendations(
				[...sameCategory, ...sameBrand],
				[input.productId],
				RECOMMENDATION_LIMIT,
			);
			if (ranked.length === RECOMMENDATION_LIMIT) return ranked;

			const fallback = await storeQueries.getHighStockFallbackProducts(
				[input.productId, ...ranked.map((product) => product.id)],
				RECOMMENDATION_LIMIT - ranked.length,
			);
			return completeRecommendations(
				[...sameCategory, ...sameBrand, ...fallback],
				[input.productId],
				RECOMMENDATION_LIMIT,
			);
		},

		async getCartCrossSells(productIds: number[]) {
			const seedIds = [...new Set(productIds)].slice(0, CROSS_SELL_INPUT_LIMIT);
			if (seedIds.length === 0) return [];

			const seeds = await storeQueries.getProductAffinityKeys(seedIds);
			const categoryIds = [...new Set(seeds.map((seed) => seed.categoryId))];
			const brandIds = [...new Set(seeds.map((seed) => seed.brandId))];
			const candidates = await storeQueries.getCrossSellCandidates({
				categoryIds,
				brandIds,
				excludeIds: seedIds,
				limit: RECOMMENDATION_OVERSAMPLE,
			});
			const ranked = completeRecommendations(
				candidates,
				seedIds,
				RECOMMENDATION_LIMIT,
			);
			if (ranked.length === RECOMMENDATION_LIMIT) return ranked;

			const fallback = await storeQueries.getHighStockFallbackProducts(
				[...seedIds, ...ranked.map((product) => product.id)],
				RECOMMENDATION_LIMIT - ranked.length,
			);
			return completeRecommendations(
				[...candidates, ...fallback],
				seedIds,
				RECOMMENDATION_LIMIT,
			);
		},

		async getProductStockStatus(id: number) {
			return db().query.ProductsTable.findFirst({
				columns: {
					status: true,
					stock: true,
				},
				where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
			});
		},

		async searchByName(searchTerm: string, limit = 8) {
			return db().query.ProductsTable.findMany({
				columns: storefrontCardColumns,
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					buildNameFallbackCondition(searchTerm),
				),
				orderBy: [inStockFirst, desc(ProductsTable.stock), asc(ProductsTable.id)],
				limit,
				with: storefrontCardRelations,
			});
		},

		async searchByNameWithStock(searchTerm: string, limit = 8) {
			return db().query.ProductsTable.findMany({
				columns: storefrontCardColumns,
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					gt(ProductsTable.stock, 0),
					buildNameFallbackCondition(searchTerm),
				),
				orderBy: [desc(ProductsTable.stock), asc(ProductsTable.id)],
				limit,
				with: storefrontCardRelations,
			});
		},

		async getProductsByIdsWithDetails(ids: number[]) {
			if (ids.length === 0) return [];
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
					status: true,
					stock: true,
				},
				where: and(
					inArray(ProductsTable.id, ids),
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
				),
				with: {
					images: {
						columns: { url: true },
						where: and(
							eq(ProductImagesTable.isPrimary, true),
							isNull(ProductImagesTable.deletedAt),
						),
					},
					brand: {
						columns: { name: true },
					},
				},
			});
		},

		// Label-data projection for the customer assistant's advice/comparison
		// tool (#22). Reuses the same active+non-deleted gate as the other
		// assistant projections but additionally pulls the descriptive label
		// fields (description, ingredients, amount/potency/dailyIntake, category)
		// the advice tool answers from. Kept separate from
		// getProductsByIdsWithDetails so the cart/order snapshot shape (#19/#23)
		// is untouched.
		async getProductsByIdsForAdvice(ids: number[]) {
			if (ids.length === 0) return [];
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
					status: true,
					stock: true,
					description: true,
					amount: true,
					potency: true,
					dailyIntake: true,
					ingredients: true,
				},
				where: and(
					inArray(ProductsTable.id, ids),
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
				),
				with: {
					brand: { columns: { name: true } },
					category: { columns: { name: true } },
				},
			});
		},

		async getInfiniteProducts(params: {
			requireStock?: boolean;
			cursor?: string | undefined;
			limit: number;
			brandId?: number;
			categoryId?: number;
			listType?: "featured" | "recent" | "discount";
			sortField?: "price" | "stock" | "createdAt";
			sortDirection?: "asc" | "desc";
			searchTerm?: string;
			minPrice?: number;
			maxPrice?: number;
		}) {
			const {
				cursor,
				limit,
				brandId,
				categoryId,
				listType,
				searchTerm,
				sortField,
				sortDirection,
			requireStock = false,
				minPrice,
				maxPrice,
			} = params;

			const conditions = buildStorefrontProductConditions({
				requireStock,
				brandId,
				categoryId,
				listType,
				minPrice,
				maxPrice,
			});

			// Use Upstash search for better text matching
			if (searchTerm !== undefined && searchTerm !== "") {
				const searchResults = await searchProducts(searchTerm, 10);
				if (searchResults.length > 0) {
					const productIds = searchResults.map((r) => r.id);
					conditions.push(inArray(ProductsTable.id, productIds));
				} else {
					// No results from search, return empty
					return { items: [], nextCursor: null };
				}
			}

			// The recent preset supplies the created-at default unless the shopper
			// explicitly chose another sort.
			const sort = resolveStorefrontProductSort({
				listType,
				sortField,
				sortDirection,
			});
			let cursorCondition: SQL<unknown> | undefined;
			if (cursor) {
				const [rankStr, sortValueStr, idStr] = cursor.split(",");
				const cursorId = Number.parseInt(idStr, 10);
				const cursorInStock = rankStr === "1";

				let sortValue: number | Date;
				if (sort.field === "price" || sort.field === "stock") {
					sortValue = Number.parseInt(sortValueStr, 10);
				} else {
					sortValue = new Date(sortValueStr);
				}

				const withinSort = sort.isAsc
					? or(
							gt(sort.column, sortValue),
							and(
								eq(sort.column, sortValue),
								gt(ProductsTable.id, cursorId),
							),
						)
					: or(
							lt(sort.column, sortValue),
							and(
								eq(sort.column, sortValue),
								lt(ProductsTable.id, cursorId),
							),
						);

				cursorCondition = sort.prioritizeStock
					? or(
							sql`${inStockRankExpr} < ${cursorInStock}`,
							and(sql`${inStockRankExpr} = ${cursorInStock}`, withinSort),
						)
					: withinSort;
			}

			const items = await db().query.ProductsTable.findMany({
				limit,
				columns: { ...storefrontCardColumns, createdAt: true },
				where: and(...conditions, cursorCondition),
				orderBy: sort.orderBy,
				with: storefrontCardRelations,
			});

			// Build next cursor from the last item
			let nextCursor: string | null = null;
			if (items.length === limit && items.length > 0) {
				const lastItem = items[items.length - 1];
				const sortValue =
					sort.field === "price"
						? lastItem.price
						: sort.field === "stock"
							? lastItem.stock
							: lastItem.createdAt.toISOString();
				const rank = lastItem.stock > 0 ? 1 : 0;
				nextCursor = `${rank},${sortValue},${lastItem.id}`;
			}

			return {
				items,
				nextCursor,
			};
		},

		// Lightweight COUNT(*) for the storefront catalog header. Mirrors the
		// active+non-deleted gate used by getInfiniteProducts so the displayed
		// total matches what the infinite list can actually paginate through,
		// including active out-of-stock products. Returns 0 if the table is empty.
		async getTotalActiveProductCount() {
			const result = await db()
				.select({ count: sql<number>`count(*)::int` })
				.from(ProductsTable)
				.where(
					and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
					),
				);
			return result[0]?.count ?? 0;
		},

		async getPaginatedProducts(params: {
			requireStock?: boolean;
			page: number;
			pageSize: number;
			brandId?: number;
			categoryId?: number;
			listType?: "featured" | "recent" | "discount";
			sortField?: "price" | "stock" | "createdAt";
			sortDirection?: "asc" | "desc";
			minPrice?: number;
			maxPrice?: number;
		}) {
			const {
				page,
				pageSize,
				brandId,
				categoryId,
				listType,
				sortField,
				sortDirection,
				requireStock = false,
				minPrice,
				maxPrice,
			} = params;

			const conditions = buildStorefrontProductConditions({
				requireStock,
				brandId,
				categoryId,
				listType,
				minPrice,
				maxPrice,
			});

			const sort = resolveStorefrontProductSort({
				listType,
				sortField,
				sortDirection,
			});
			const offset = (page - 1) * pageSize;

			const [items, countResult] = await Promise.all([
				db().query.ProductsTable.findMany({
					limit: pageSize,
					offset,
					columns: { ...storefrontCardColumns, createdAt: true },
					where: and(...conditions),
					orderBy: sort.orderBy,
					with: storefrontCardRelations,
				}),
				db()
					.select({ count: sql<number>`count(*)::int` })
					.from(ProductsTable)
					.where(and(...conditions)),
			]);

			const totalCount = countResult[0]?.count ?? 0;
			const totalPages = Math.ceil(totalCount / pageSize);

			return {
				items,
				pagination: {
					page,
					pageSize,
					totalCount,
					totalPages,
					hasNextPage: page < totalPages,
					hasPreviousPage: page > 1,
				},
			};
		},

};
