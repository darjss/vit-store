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
	sql,
} from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";
import { normalizeSearchText } from "~/lib/product-search/text";
import { buildActiveProductConditions, rankInStockProducts } from "~/queries/products/shared";

const buildNameFallbackCondition = (searchTerm: string): SQL<unknown> => {
	const tokens = normalizeSearchText(searchTerm).split(" ").filter(Boolean);
	if (tokens.length === 0) {
		const nameMatch = or(
			ilike(ProductsTable.name, `%${searchTerm}%`),
			ilike(ProductsTable.name_mn, `%${searchTerm}%`),
		);
		if (nameMatch === undefined) {
			throw new Error("name fallback requires at least one ilike condition");
		}
		return nameMatch;
	}

	const nameNoComma = sql`replace(${ProductsTable.name}, ',', '')`;
	const nameMnNoComma = sql`replace(${ProductsTable.name_mn}, ',', '')`;
	const tokenConditions = tokens
		.slice(0, 6)
		.map((token) => or(ilike(nameNoComma, `%${token}%`), ilike(nameMnNoComma, `%${token}%`)))
		.filter((condition): condition is SQL<unknown> => condition !== undefined);
	const tokenMatch = and(...tokenConditions);
	if (tokenMatch === undefined) {
		throw new Error("name fallback requires at least one token condition");
	}
	return tokenMatch;
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
	brandId?: number;
	categoryId?: number;
	listType?: "featured" | "recent" | "discount";
	maxPrice?: number;
	minPrice?: number;
	requireStock?: boolean;
};

const resolveStorefrontProductSort = ({
	listType,
	sortDirection,
	sortField,
}: {
	listType?: "featured" | "recent" | "discount";
	sortDirection?: "asc" | "desc";
	sortField?: "price" | "stock" | "createdAt";
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
		column,
		field,
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
	brandId,
	categoryId,
	listType,
	maxPrice,
	minPrice,
	requireStock = false,
}: StorefrontProductFilters): Array<SQL<unknown>> => {
	const conditions: Array<SQL<unknown>> = [
		isNull(ProductsTable.deletedAt),
		eq(ProductsTable.status, "active"),
	];
	if (requireStock) {
		conditions.push(gt(ProductsTable.stock, 0));
	}
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
	products: Array<StorefrontCardRow>,
	excludeIds: Iterable<number>,
	limit: number,
) => rankInStockProducts(products, { excludeIds, limit }).map(projectStorefrontCard);

export const storeQueries = {
	async getAllProducts() {
		return db().query.ProductsTable.findMany({
			columns: {
				id: true,
				slug: true,
			},
			where: and(isNull(ProductsTable.deletedAt), eq(ProductsTable.status, "active")),
		});
	},

	async getCartCrossSells(productIds: Array<number>) {
		const seedIds = [...new Set(productIds)].slice(0, CROSS_SELL_INPUT_LIMIT);
		if (seedIds.length === 0) {
			return [];
		}

		const seeds = await storeQueries.getProductAffinityKeys(seedIds);
		const categoryIds = [...new Set(seeds.map((seed) => seed.categoryId))];
		const brandIds = [...new Set(seeds.map((seed) => seed.brandId))];
		const candidates = await storeQueries.getCrossSellCandidates({
			brandIds,
			categoryIds,
			excludeIds: seedIds,
			limit: RECOMMENDATION_OVERSAMPLE,
		});
		const ranked = completeRecommendations(candidates, seedIds, RECOMMENDATION_LIMIT);
		if (ranked.length === RECOMMENDATION_LIMIT) {
			return ranked;
		}

		const fallback = await storeQueries.getHighStockFallbackProducts(
			[...seedIds, ...ranked.map((product) => product.id)],
			RECOMMENDATION_LIMIT - ranked.length,
		);
		return completeRecommendations([...candidates, ...fallback], seedIds, RECOMMENDATION_LIMIT);
	},

	async getCrossSellCandidates(options: {
		brandIds: Array<number>;
		categoryIds: Array<number>;
		excludeIds: Array<number>;
		limit?: number;
	}) {
		const { brandIds, categoryIds, excludeIds, limit = 20 } = options;
		const affinityParts = [
			...(categoryIds.length > 0 ? [inArray(ProductsTable.categoryId, categoryIds)] : []),
			...(brandIds.length > 0 ? [inArray(ProductsTable.brandId, brandIds)] : []),
		];
		if (affinityParts.length === 0) {
			return [];
		}

		const affinity = affinityParts.length === 1 ? affinityParts[0] : or(...affinityParts);

		return db().query.ProductsTable.findMany({
			columns: recommendableProductColumns,
			limit,
			orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
			where: and(
				buildActiveProductConditions(true),
				affinity,
				excludeIds.length > 0 ? notInArray(ProductsTable.id, excludeIds) : undefined,
			),
			with: recommendableProductWith,
		});
	},

	async getDiscountedProducts(options?: { requireStock?: boolean }) {
		const requireStock = options?.requireStock ?? false;
		return db().query.ProductsTable.findMany({
			columns: storefrontCardColumns,
			limit: 4,
			orderBy: [inStockFirst, desc(ProductsTable.updatedAt)],
			where: and(gt(ProductsTable.discount, 0), buildActiveProductConditions(requireStock)),
			with: storefrontCardRelations,
		});
	},

	async getFeaturedProducts(options?: { requireStock?: boolean }) {
		const requireStock = options?.requireStock ?? false;
		return db().query.ProductsTable.findMany({
			columns: storefrontCardColumns,
			limit: 8,
			orderBy: desc(ProductsTable.stock),
			where: buildActiveProductConditions(requireStock),
			with: storefrontCardRelations,
		});
	},

	async getHighStockFallbackProducts(excludeIds: Array<number>, limit = 6) {
		return db().query.ProductsTable.findMany({
			columns: recommendableProductColumns,
			limit,
			orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
			where: and(
				buildActiveProductConditions(true),
				excludeIds.length > 0 ? notInArray(ProductsTable.id, excludeIds) : undefined,
			),
			with: recommendableProductWith,
		});
	},

	async getNewProducts(options?: { requireStock?: boolean }) {
		const requireStock = options?.requireStock ?? false;
		return db().query.ProductsTable.findMany({
			columns: storefrontCardColumns,
			limit: 4,
			orderBy: [inStockFirst, desc(ProductsTable.updatedAt)],
			where: buildActiveProductConditions(requireStock),
			with: storefrontCardRelations,
		});
	},

	async getPrerenderCatalog() {
		return db().query.ProductsTable.findMany({
			columns: {
				id: true,
				oldSlugs: true,
				slug: true,
			},
			where: and(isNull(ProductsTable.deletedAt), eq(ProductsTable.status, "active")),
		});
	},

	async getProductAffinityKeys(ids: Array<number>) {
		if (ids.length === 0) {
			return [];
		}
		return db().query.ProductsTable.findMany({
			columns: {
				brandId: true,
				categoryId: true,
				id: true,
			},
			where: and(
				inArray(ProductsTable.id, ids),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
		});
	},

	async getProductById(id: number) {
		return db().query.ProductsTable.findFirst({
			columns: {
				amount: true,
				brandId: true,
				categoryId: true,
				dailyIntake: true,
				description: true,
				discount: true,
				expirationDate: true,
				id: true,
				ingredients: true,
				name: true,
				potency: true,
				price: true,
				seoDescription: true,
				seoTitle: true,
				slug: true,
				status: true,
				stock: true,
				weightGrams: true,
			},
			where: and(
				eq(ProductsTable.id, id),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
			with: {
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
				images: {
					columns: {
						isPrimary: true,
						url: true,
					},
				},
			},
		});
	},

	async getProductInventory(productIds: Array<number>) {
		return db().query.ProductsTable.findMany({
			columns: {
				id: true,
				price: true,
				status: true,
				stock: true,
			},
			where: and(
				inArray(ProductsTable.id, productIds),
				eq(ProductsTable.status, "active"),
				isNull(ProductsTable.deletedAt),
			),
		});
	},

	async getProductsByIds(ids: Array<number>) {
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
					where: and(eq(ProductImagesTable.isPrimary, true), isNull(ProductImagesTable.deletedAt)),
				},
			},
		});
	},

	async getProductsByIdsWithDetails(ids: Array<number>) {
		if (ids.length === 0) {
			return [];
		}
		return db().query.ProductsTable.findMany({
			columns: {
				id: true,
				name: true,
				price: true,
				slug: true,
				status: true,
				stock: true,
			},
			where: and(
				inArray(ProductsTable.id, ids),
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
			),
			with: {
				brand: {
					columns: { name: true },
				},
				images: {
					columns: { url: true },
					where: and(eq(ProductImagesTable.isPrimary, true), isNull(ProductImagesTable.deletedAt)),
				},
			},
		});
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

	async getRecommendations(input: { brandId: number; categoryId: number; productId: number }) {
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
		if (ranked.length === RECOMMENDATION_LIMIT) {
			return ranked;
		}

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

	async getRecommendedProductsByBrand(brandId: number, excludeProductId: number, limit = 12) {
		return db().query.ProductsTable.findMany({
			columns: recommendableProductColumns,
			limit,
			orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
			where: and(
				eq(ProductsTable.brandId, brandId),
				buildActiveProductConditions(true),
				ne(ProductsTable.id, excludeProductId),
			),
			with: recommendableProductWith,
		});
	},

	async getRecommendedProductsByCategory(categoryId: number, excludeProductId: number, limit = 12) {
		return db().query.ProductsTable.findMany({
			columns: recommendableProductColumns,
			limit,
			orderBy: [desc(ProductsTable.stock), desc(ProductsTable.updatedAt)],
			where: and(
				eq(ProductsTable.categoryId, categoryId),
				buildActiveProductConditions(true),
				ne(ProductsTable.id, excludeProductId),
			),
			with: recommendableProductWith,
		});
	},

	async searchByName(searchTerm: string, limit = 8) {
		return db().query.ProductsTable.findMany({
			columns: storefrontCardColumns,
			limit,
			orderBy: [inStockFirst, desc(ProductsTable.stock), asc(ProductsTable.id)],
			where: and(
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
				buildNameFallbackCondition(searchTerm),
			),
			with: storefrontCardRelations,
		});
	},

	async searchByNameWithStock(searchTerm: string, limit = 8) {
		return db().query.ProductsTable.findMany({
			columns: storefrontCardColumns,
			limit,
			orderBy: [desc(ProductsTable.stock), asc(ProductsTable.id)],
			where: and(
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
				gt(ProductsTable.stock, 0),
				buildNameFallbackCondition(searchTerm),
			),
			with: storefrontCardRelations,
		});
	},

	// Label-data projection for the customer assistant's advice/comparison
	// tool (#22). Reuses the same active+non-deleted gate as the other
	// assistant projections but additionally pulls the descriptive label
	// fields (description, ingredients, amount/potency/dailyIntake, category)
	// the advice tool answers from. Kept separate from
	// getProductsByIdsWithDetails so the cart/order snapshot shape (#19/#23)
	// is untouched.
	async getInfiniteProducts(params: {
		brandId?: number;
		categoryId?: number;
		cursor?: string | undefined;
		limit: number;
		listType?: "featured" | "recent" | "discount";
		maxPrice?: number;
		minPrice?: number;
		requireStock?: boolean;
		searchTerm?: string;
		sortDirection?: "asc" | "desc";
		sortField?: "price" | "stock" | "createdAt";
	}) {
		const {
			brandId,
			categoryId,
			cursor,
			limit,
			listType,
			maxPrice,
			minPrice,
			requireStock = false,
			searchTerm,
			sortDirection,
			sortField,
		} = params;

		const conditions = buildStorefrontProductConditions({
			brandId,
			categoryId,
			listType,
			maxPrice,
			minPrice,
			requireStock,
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
			sortDirection,
			sortField,
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
						and(eq(sort.column, sortValue), gt(ProductsTable.id, cursorId)),
					)
				: or(
						lt(sort.column, sortValue),
						and(eq(sort.column, sortValue), lt(ProductsTable.id, cursorId)),
					);

			cursorCondition = sort.prioritizeStock
				? or(
						sql`${inStockRankExpr} < ${cursorInStock}`,
						and(sql`${inStockRankExpr} = ${cursorInStock}`, withinSort),
					)
				: withinSort;
		}

		const items = await db().query.ProductsTable.findMany({
			columns: { ...storefrontCardColumns, createdAt: true },
			limit,
			orderBy: sort.orderBy,
			where: and(...conditions, cursorCondition),
			with: storefrontCardRelations,
		});

		// Build next cursor from the last item
		let nextCursor: string | null = null;
		if (items.length === limit && items.length > 0) {
			const lastItem = items.at(-1);
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

	async getProductsByIdsForAdvice(ids: Array<number>) {
		if (ids.length === 0) {
			return [];
		}
		return db().query.ProductsTable.findMany({
			columns: {
				amount: true,
				dailyIntake: true,
				description: true,
				id: true,
				ingredients: true,
				name: true,
				potency: true,
				price: true,
				slug: true,
				status: true,
				stock: true,
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

	// Lightweight COUNT(*) for the storefront catalog header. Mirrors the
	// active+non-deleted gate used by getInfiniteProducts so the displayed
	// total matches what the infinite list can actually paginate through,
	// including active out-of-stock products. Returns 0 if the table is empty.
	async getPaginatedProducts(params: {
		brandId?: number;
		categoryId?: number;
		listType?: "featured" | "recent" | "discount";
		maxPrice?: number;
		minPrice?: number;
		page: number;
		pageSize: number;
		requireStock?: boolean;
		sortDirection?: "asc" | "desc";
		sortField?: "price" | "stock" | "createdAt";
	}) {
		const {
			brandId,
			categoryId,
			listType,
			maxPrice,
			minPrice,
			page,
			pageSize,
			requireStock = false,
			sortDirection,
			sortField,
		} = params;

		const conditions = buildStorefrontProductConditions({
			brandId,
			categoryId,
			listType,
			maxPrice,
			minPrice,
			requireStock,
		});

		const sort = resolveStorefrontProductSort({
			listType,
			sortDirection,
			sortField,
		});
		const offset = (page - 1) * pageSize;

		const [items, countResult] = await Promise.all([
			db().query.ProductsTable.findMany({
				columns: { ...storefrontCardColumns, createdAt: true },
				limit: pageSize,
				offset,
				orderBy: sort.orderBy,
				where: and(...conditions),
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
				hasNextPage: page < totalPages,
				hasPreviousPage: page > 1,
				page,
				pageSize,
				totalCount,
				totalPages,
			},
		};
	},

	async getTotalActiveProductCount() {
		const result = await db()
			.select({ count: sql<number>`count(*)::int` })
			.from(ProductsTable)
			.where(and(isNull(ProductsTable.deletedAt), eq(ProductsTable.status, "active")));
		return result[0]?.count ?? 0;
	},
};
