import type { status } from "@vit/shared/constants";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	ilike,
	inArray,
	isNull,
	lt,
	or,
	type SQLWrapper,
	sql,
} from "drizzle-orm";
import { db } from "~/db/client";
import { BrandsTable, ProductImagesTable, ProductsTable } from "~/db/schema";
import { searchProducts } from "~/lib/product-search/client";
import { normalizeSearchText } from "~/lib/product-search/text";

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

type ProductStatus = (typeof status)[number];

import { buildActiveProductConditions } from "~/queries/products/shared";

export const storeQueries = {
		async getFeaturedProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
					name: true,
					price: true,
				},
				orderBy: desc(ProductsTable.stock),
				limit: 8,
				where: buildActiveProductConditions(requireStock),
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
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
		},

		async getNewProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					price: true,
					slug: true,
				},
				orderBy: desc(ProductsTable.updatedAt),
				limit: 4,
				where: buildActiveProductConditions(requireStock),
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
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
		},

		async getDiscountedProducts(options?: { requireStock?: boolean }) {
			const requireStock = options?.requireStock ?? false;
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
					name: true,
					price: true,
					discount: true,
				},
				orderBy: desc(ProductsTable.updatedAt),
				limit: 4,
				where: and(
					gt(ProductsTable.discount, 0),
					buildActiveProductConditions(requireStock),
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
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
		},

		async getFeaturedProductsWithStock() {
			return this.getFeaturedProducts({ requireStock: true });
		},

		async getNewProductsWithStock() {
			return this.getNewProducts({ requireStock: true });
		},

		async getDiscountedProductsWithStock() {
			return this.getDiscountedProducts({ requireStock: true });
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
					gt(ProductsTable.stock, 0),
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
		) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
					name: true,
					price: true,
					discount: true,
				},
				limit: 2,
				where: and(
					eq(ProductsTable.categoryId, categoryId),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
					sql`${ProductsTable.id} != ${excludeProductId}`,
				),
				orderBy: desc(ProductsTable.updatedAt),
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
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});
		},

		async getRecommendedProductsByBrand(
			brandId: number,
			excludeProductId: number,
		) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					slug: true,
					name: true,
					price: true,
					discount: true,
				},
				limit: 2,
				where: and(
					eq(ProductsTable.brandId, brandId),
					eq(ProductsTable.status, "active"),
					isNull(ProductsTable.deletedAt),
					sql`${ProductsTable.id} != ${excludeProductId}`,
				),
				orderBy: desc(ProductsTable.updatedAt),
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
					brand: {
						columns: {
							name: true,
						},
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

		async searchByName(searchTerm: string, limit = 8) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
					status: true,
					stock: true,
					discount: true,
					categoryId: true,
				},
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					buildNameFallbackCondition(searchTerm),
				),
				limit,
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

		async searchByNameWithStock(searchTerm: string, limit = 8) {
			return db().query.ProductsTable.findMany({
				columns: {
					id: true,
					name: true,
					slug: true,
					price: true,
					status: true,
					stock: true,
					discount: true,
					categoryId: true,
				},
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					gt(ProductsTable.stock, 0),
					buildNameFallbackCondition(searchTerm),
				),
				limit,
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
		}) {
			const {
				cursor,
				limit,
				brandId,
				categoryId,
				listType,
				searchTerm,
				sortField = "stock",
				sortDirection = "desc",
			requireStock = false,
			} = params;

			// Build filter conditions
			const conditions: (SQL<unknown> | undefined)[] = [];
			if (requireStock) conditions.push(gt(ProductsTable.stock, 0));
			if (brandId !== undefined && brandId !== 0)
				conditions.push(eq(ProductsTable.brandId, brandId));
			if (categoryId !== undefined && categoryId !== 0)
				conditions.push(eq(ProductsTable.categoryId, categoryId));
			if (listType === "featured") {
				conditions.push(eq(ProductsTable.isFeatured, true));
			}
			if (listType === "discount") {
				conditions.push(gt(ProductsTable.discount, 0));
			}

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

			const finalConditions = conditions.filter(
				(c): c is SQL<unknown> => c !== undefined,
			);

			// Determine sort column and order
			const sortColumn =
				sortField === "price"
					? ProductsTable.price
					: sortField === "stock"
						? ProductsTable.stock
						: ProductsTable.createdAt;

			const isAsc = sortDirection === "asc";
			const orderByClauses = isAsc
				? [asc(sortColumn), asc(ProductsTable.id)]
				: [desc(sortColumn), desc(ProductsTable.id)];

			// Build cursor condition for pagination
			let cursorCondition: SQL<unknown> | undefined;
			if (cursor) {
				const [sortValueStr, idStr] = cursor.split(",");
				const cursorId = Number.parseInt(idStr, 10);

				let sortValue: number | Date;
				if (sortField === "price" || sortField === "stock") {
					sortValue = Number.parseInt(sortValueStr, 10);
				} else {
					sortValue = new Date(sortValueStr);
				}

				// For cursor pagination: get items after/before the cursor based on sort direction
				if (isAsc) {
					cursorCondition = or(
						gt(sortColumn, sortValue),
						and(eq(sortColumn, sortValue), gt(ProductsTable.id, cursorId)),
					);
				} else {
					cursorCondition = or(
						lt(sortColumn, sortValue),
						and(eq(sortColumn, sortValue), lt(ProductsTable.id, cursorId)),
					);
				}
			}

			const items = await db().query.ProductsTable.findMany({
				limit,
				columns: {
					id: true,
					name: true,
					price: true,
					slug: true,
					createdAt: true,
					stock: true,
					discount: true,
					categoryId: true,
				},
				where: and(
					isNull(ProductsTable.deletedAt),
					eq(ProductsTable.status, "active"),
					cursorCondition,
					finalConditions.length > 0 ? and(...finalConditions) : undefined,
				),
				orderBy: orderByClauses,
				with: {
					images: {
						columns: {
							url: true,
						},
						where: and(
							isNull(ProductImagesTable.deletedAt),
							eq(ProductImagesTable.isPrimary, true),
						),
					},
					brand: {
						columns: {
							name: true,
						},
					},
				},
			});

			// Build next cursor from the last item
			let nextCursor: string | null = null;
			if (items.length === limit && items.length > 0) {
				const lastItem = items[items.length - 1];
				const sortValue =
					sortField === "price"
						? lastItem.price
						: sortField === "stock"
							? lastItem.stock
							: lastItem.createdAt.toISOString();
				nextCursor = `${sortValue},${lastItem.id}`;
			}

			return {
				items,
				nextCursor,
			};
		},

		async getInfiniteProductsWithStock(params: {
			cursor?: string | undefined;
			limit: number;
			brandId?: number;
			categoryId?: number;
			listType?: "featured" | "recent" | "discount";
			searchTerm?: string;
			sortField?: "price" | "stock" | "createdAt";
			sortDirection?: "asc" | "desc";
		}) {
			return storeQueries.getInfiniteProducts({ ...params, requireStock: true });
		},

		// Lightweight COUNT(*) for the storefront catalog header. Mirrors the
		// active+non-deleted+in-stock gate used by getInfiniteProductsWithStock
		// so the displayed total matches what the infinite list can actually
		// paginate through. Returns 0 if the table is empty.
		async getTotalActiveProductCount() {
			const result = await db()
				.select({ count: sql<number>`count(*)::int` })
				.from(ProductsTable)
				.where(
					and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
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
			sortField?: "price" | "stock" | "createdAt";
			sortDirection?: "asc" | "desc";
		}) {
			const {
				page,
				pageSize,
				brandId,
				categoryId,
				sortField = "stock",
				sortDirection = "desc",
				requireStock = false,
			} = params;

			const conditions: (SQL<unknown> | undefined)[] = [];
			if (requireStock) conditions.push(gt(ProductsTable.stock, 0));
			if (brandId !== undefined && brandId !== 0)
				conditions.push(eq(ProductsTable.brandId, brandId));
			if (categoryId !== undefined && categoryId !== 0)
				conditions.push(eq(ProductsTable.categoryId, categoryId));

			const finalConditions = conditions.filter(
				(c): c is SQL<unknown> => c !== undefined,
			);

			const sortColumn =
				sortField === "price"
					? ProductsTable.price
					: sortField === "stock"
						? ProductsTable.stock
						: ProductsTable.createdAt;

			const isAsc = sortDirection === "asc";
			const orderByClauses = isAsc
				? [asc(sortColumn), asc(ProductsTable.id)]
				: [desc(sortColumn), desc(ProductsTable.id)];

			const offset = (page - 1) * pageSize;

			const [items, countResult] = await Promise.all([
				db().query.ProductsTable.findMany({
					limit: pageSize,
					offset,
					columns: {
						id: true,
						name: true,
						price: true,
						slug: true,
						createdAt: true,
						stock: true,
						discount: true,
						categoryId: true,
					},
					where: and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
						finalConditions.length > 0
							? and(...finalConditions)
							: undefined,
					),
					orderBy: orderByClauses,
					with: {
						images: {
							columns: {
								url: true,
							},
							where: and(
								isNull(ProductImagesTable.deletedAt),
								eq(ProductImagesTable.isPrimary, true),
							),
						},
						brand: {
							columns: {
								name: true,
							},
						},
					},
				}),
				db()
					.select({ count: sql<number>`count(*)::int` })
					.from(ProductsTable)
					.where(
						and(
							isNull(ProductsTable.deletedAt),
							eq(ProductsTable.status, "active"),
							finalConditions.length > 0
								? and(...finalConditions)
								: undefined,
						),
					),
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

		async getPaginatedProductsWithStock(params: {
			page: number;
			pageSize: number;
			brandId?: number;
			categoryId?: number;
			sortField?: "price" | "stock" | "createdAt";
			sortDirection?: "asc" | "desc";
		}) {
			return storeQueries.getPaginatedProducts({ ...params, requireStock: true });
		},
};
