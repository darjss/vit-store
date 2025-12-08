import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	gt,
	inArray,
	isNull,
	like,
	lt,
	or,
	sql,
} from "drizzle-orm";
import type { DB } from "../db";
import { BrandsTable, ProductImagesTable, ProductsTable } from "../db/schema";
import type { status } from "../lib/constants";
import { searchProducts } from "../lib/upstash-search";

type ProductStatus = (typeof status)[number];

export function productQueries(db: DB) {
	return {
		admin: {
			async searchByName(searchTerm: string, limit = 3) {
				return db.query.ProductsTable.findMany({
					where: and(
						isNull(ProductsTable.deletedAt),
						like(ProductsTable.name, `%${searchTerm}%`),
					),
					limit,
					with: {
						images: { where: isNull(ProductImagesTable.deletedAt) },
					},
				});
			},

			async searchByNameForOrder(searchTerm: string, limit = 3) {
				return db.query.ProductsTable.findMany({
					where: and(
						isNull(ProductsTable.deletedAt),
						like(ProductsTable.name, `%${searchTerm}%`),
					),
					limit,
					columns: {
						id: true,
						name: true,
						price: true,
						stock: true,
					},
					with: {
						images: {
							columns: { url: true },
							where: and(
								eq(ProductImagesTable.isPrimary, true),
								isNull(ProductImagesTable.deletedAt),
							),
						},
					},
				});
			},

			async getBrandById(brandId: number) {
				return db.query.BrandsTable.findFirst({
					where: eq(BrandsTable.id, brandId),
				});
			},

			async createProduct(data: {
				name: string;
				slug: string;
				description: string;
				discount: number;
				amount: string;
				potency: string;
				stock: number;
				price: number;
				dailyIntake: number;
				categoryId: number;
				brandId: number;
				status: ProductStatus;
			}) {
				const result = await db.insert(ProductsTable).values(data).returning();
				return result[0];
			},

			async createProductImages(
				productId: number,
				images: Array<{ url: string; isPrimary: boolean }>,
			) {
				const values = images.map((img) => ({
					productId,
					url: img.url,
					isPrimary: img.isPrimary,
				}));
				await db.insert(ProductImagesTable).values(values);
			},

			async getProductBenchmark() {
				return db.query.ProductsTable.findMany({
					with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
				});
			},

			async getProductById(id: number) {
				return db.query.ProductsTable.findFirst({
					where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
					with: {
						images: {
							columns: { id: true, url: true, isPrimary: true },
							where: isNull(ProductImagesTable.deletedAt),
						},
						category: { columns: { name: true } },
						brand: { columns: { name: true } },
					},
				});
			},

			async updateProduct(
				id: number,
				data: {
					name: string;
					slug: string;
					description?: string;
					discount?: number;
					amount?: string;
					potency?: string;
					stock?: number;
					price?: number;
					dailyIntake?: number;
					categoryId?: number;
					brandId?: number;
					status?: ProductStatus;
				},
			) {
				await db
					.update(ProductsTable)
					.set(data)
					.where(
						and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
					);
			},

			async getProductImages(productId: number) {
				return db
					.select({ id: ProductImagesTable.id, url: ProductImagesTable.url })
					.from(ProductImagesTable)
					.where(
						and(
							eq(ProductImagesTable.productId, productId),
							isNull(ProductImagesTable.deletedAt),
						),
					);
			},

			async softDeleteProductImages(productId: number) {
				const images = await this.getProductImages(productId);
				const deletePromises = images.map((image) =>
					db
						.update(ProductImagesTable)
						.set({ deletedAt: new Date() })
						.where(
							and(
								eq(ProductImagesTable.id, image.id),
								isNull(ProductImagesTable.deletedAt),
							),
						),
				);
				await Promise.allSettled(deletePromises);
			},

			async updateStock(
				productId: number,
				numberToUpdate: number,
				type: "add" | "minus",
			) {
				await db
					.update(ProductsTable)
					.set({
						stock: sql`${ProductsTable.stock} ${type === "add" ? sql`+` : sql`-`} ${numberToUpdate}`,
					})
					.where(
						and(
							eq(ProductsTable.id, productId),
							isNull(ProductsTable.deletedAt),
						),
					);
			},

			async deleteProduct(id: number) {
				await db
					.update(ProductsTable)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
					);
			},

			async getAllProducts() {
				return db.query.ProductsTable.findMany({
					where: isNull(ProductsTable.deletedAt),
					with: {
						images: {
							columns: { id: true, url: true, isPrimary: true },
							where: isNull(ProductImagesTable.deletedAt),
						},
					},
				});
			},

			async getPaginatedProducts(params: {
				page: number;
				pageSize: number;
				brandId?: number;
				categoryId?: number;
				sortField?: string;
				sortDirection?: "asc" | "desc";
				searchTerm?: string;
			}) {
				const conditions: (SQL<unknown> | undefined)[] = [];
				if (params.brandId !== undefined && params.brandId !== 0)
					conditions.push(eq(ProductsTable.brandId, params.brandId));
				if (params.categoryId !== undefined && params.categoryId !== 0)
					conditions.push(eq(ProductsTable.categoryId, params.categoryId));
				if (params.searchTerm !== undefined)
					conditions.push(like(ProductsTable.name, `%${params.searchTerm}%`));
				const orderByClauses: SQL<unknown>[] = [];
				const primarySortColumn =
					params.sortField === "price"
						? ProductsTable.price
						: params.sortField === "stock"
							? ProductsTable.stock
							: ProductsTable.createdAt;
				const primaryOrderBy =
					params.sortDirection === "asc"
						? asc(primarySortColumn)
						: desc(primarySortColumn);
				orderByClauses.push(primaryOrderBy);
				orderByClauses.push(asc(ProductsTable.id));
				const finalConditions = conditions.filter(
					(c): c is SQL<unknown> => c !== undefined,
				);
				const offset = (params.page - 1) * params.pageSize;
				const products = await db.query.ProductsTable.findMany({
					limit: params.pageSize,
					offset: offset,
					orderBy: orderByClauses,
					where: and(
						isNull(ProductsTable.deletedAt),
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					),
					with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
				});
				const totalCountResult = await db
					.select({ count: sql<number>`COUNT(*)` })
					.from(ProductsTable)
					.where(
						and(
							isNull(ProductsTable.deletedAt),
							finalConditions.length > 0 ? and(...finalConditions) : undefined,
						),
					)
					.limit(1);
				const totalCount = totalCountResult[0]?.count ?? 0;
				const totalPages = Math.ceil(totalCount / params.pageSize);
				return {
					products,
					pagination: {
						currentPage: params.page,
						totalPages,
						totalCount,
						hasNextPage: params.page < totalPages,
						hasPreviousPage: params.page > 1,
					},
				};
			},

			async setProductStock(id: number, newStock: number) {
				await db
					.update(ProductsTable)
					.set({ stock: newStock })
					.where(
						and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
					);
			},

			async getAllProductValue() {
				const result = await db
					.select({ stock: ProductsTable.stock, price: ProductsTable.price })
					.from(ProductsTable)
					.where(isNull(ProductsTable.deletedAt));
				return result.reduce(
					(acc, product) => acc + product.price * product.stock,
					0,
				);
			},

			async updateProductField(
				id: number,
				field: string,
				value: string | number | null,
			) {
				await db
					.update(ProductsTable)
					.set({ [field]: value })
					.where(
						and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
					);
			},
		},

		store: {
			async getFeaturedProducts() {
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						slug: true,
						name: true,
						price: true,
					},
					orderBy: asc(ProductsTable.updatedAt),
					limit: 4,
					where: and(
						eq(ProductsTable.isFeatured, true),
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
						brand: {
							columns: {
								name: true,
							},
						},
					},
				});
			},

			async getNewProducts() {
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						name: true,
						price: true,
						slug: true,
					},
					orderBy: desc(ProductsTable.updatedAt),
					limit: 4,
					where: and(
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
						brand: {
							columns: {
								name: true,
							},
						},
					},
				});
			},

			async getDiscountedProducts() {
				return db.query.ProductsTable.findMany({
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
						brand: {
							columns: {
								name: true,
							},
						},
					},
				});
			},

			async getAllProducts() {
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						slug: true,
					},
					where: isNull(ProductsTable.deletedAt),
				});
			},

			async getProductById(id: number) {
				return db.query.ProductsTable.findFirst({
					columns: {
						id: true,
						name: true,
						price: true,
						status: true,
						description: true,
						discount: true,
						amount: true,
						potency: true,
						dailyIntake: true,
						categoryId: true,
						brandId: true,
						ingredients: true,
						weightGrams: true,
						seoTitle: true,
						seoDescription: true,
					},
					where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
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
							},
						},
					},
				});
			},

			async getProductsByIds(ids: number[]) {
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						name: true,
						price: true,
					},
					where: and(
						inArray(ProductsTable.id, ids),
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
				return db.query.ProductsTable.findMany({
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
				return db.query.ProductsTable.findMany({
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
				return db.query.ProductsTable.findFirst({
					columns: {
						status: true,
						stock: true,
					},
					where: and(eq(ProductsTable.id, id), isNull(ProductsTable.deletedAt)),
				});
			},

			async searchByName(searchTerm: string, limit = 8) {
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						name: true,
						slug: true,
						price: true,
					},
					where: and(
						isNull(ProductsTable.deletedAt),
						eq(ProductsTable.status, "active"),
						or(
							like(ProductsTable.name, `%${searchTerm}%`),
							like(ProductsTable.name_mn, `%${searchTerm}%`),
						),
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
				return db.query.ProductsTable.findMany({
					columns: {
						id: true,
						name: true,
						slug: true,
						price: true,
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

			async getProductBenchmark(limit = 10) {
				return db.query.ProductsTable.findMany({
					limit,
					with: { images: { where: isNull(ProductImagesTable.deletedAt) } },
				});
			},

			async getInfiniteProducts(params: {
				cursor?: string | undefined;
				limit: number;
				brandId?: number;
				categoryId?: number;
				sortField?: "price" | "stock" | "createdAt";
				sortDirection?: "asc" | "desc";
				searchTerm?: string;
			}) {
				const {
					cursor,
					limit,
					brandId,
					categoryId,
					searchTerm,
					sortField = "createdAt",
					sortDirection = "desc",
				} = params;

				// Build filter conditions
				const conditions: (SQL<unknown> | undefined)[] = [];
				if (brandId !== undefined && brandId !== 0)
					conditions.push(eq(ProductsTable.brandId, brandId));
				if (categoryId !== undefined && categoryId !== 0)
					conditions.push(eq(ProductsTable.categoryId, categoryId));

				// Use Upstash search for better text matching
				if (searchTerm !== undefined && searchTerm !== "") {
					const searchResults = await searchProducts(searchTerm, 100);
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

				const items = await db.query.ProductsTable.findMany({
					limit,
					columns: {
						id: true,
						name: true,
						price: true,
						slug: true,
						createdAt: true,
						stock: true,
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
		},
	};
}
