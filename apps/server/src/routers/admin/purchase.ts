import { TRPCError } from "@trpc/server";
import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, isNull, like, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { ProductsTable, PurchasesTable } from "@/db/schema";
import { PRODUCT_PER_PAGE } from "@/lib/constants";
import { adminProcedure, router } from "@/lib/trpc";
import { addPurchaseSchema } from "@/lib/zod/schema";

export const purchase = router({
	addPurchase: adminProcedure
		.input(addPurchaseSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.transaction(async (tx) => {
					for (const product of input.products) {
						await tx.insert(PurchasesTable).values({
							productId: product.productId,
							quantityPurchased: product.quantity,
							unitCost: product.unitCost,
						});

						const currentProduct = await tx.query.ProductsTable.findFirst({
							where: and(
								eq(ProductsTable.id, product.productId),
								isNull(ProductsTable.deletedAt),
							),
							columns: { stock: true },
						});

						const newStock = (currentProduct?.stock || 0) + product.quantity;

						await tx
							.update(ProductsTable)
							.set({ stock: newStock })
							.where(
								and(
									eq(ProductsTable.id, product.productId),
									isNull(ProductsTable.deletedAt),
								),
							);
					}
				});

				return { message: "Purchase added successfully" };
			} catch (e) {
				console.error("Error adding purchase:", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Adding purchase failed",
					cause: e,
				});
			}
		}),

	getAllPurchases: adminProcedure.query(async ({ ctx }) => {
		try {
			const result = await ctx.db.query.PurchasesTable.findMany({
				where: isNull(PurchasesTable.deletedAt),
				with: {
					product: { columns: { name: true, id: true, price: true } },
				},
				orderBy: desc(PurchasesTable.createdAt),
			});
			return result;
		} catch (e) {
			console.error("error", e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Fetching purchases failed",
				cause: e,
			});
		}
	}),

	getPurchaseById: adminProcedure
		.input(z.object({ id: z.number() }))
		.query(async ({ ctx, input }) => {
			try {
				const result = await ctx.db.query.PurchasesTable.findFirst({
					where: and(
						eq(PurchasesTable.id, input.id),
						isNull(PurchasesTable.deletedAt),
					),
					with: { product: { columns: { name: true, id: true, price: true } } },
				});
				return result;
			} catch (e) {
				console.error("error", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchase failed",
					cause: e,
				});
			}
		}),

	getPaginatedPurchases: adminProcedure
		.input(
			z.object({
				page: z.number().default(1),
				pageSize: z.number().default(PRODUCT_PER_PAGE),
				productId: z.number().optional(),
				sortField: z.string().optional(),
				sortDirection: z.enum(["asc", "desc"]).default("desc"),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const conditions: (SQL<unknown> | undefined)[] = [
					isNull(PurchasesTable.deletedAt) as unknown as SQL<unknown>,
				];
				if (input.productId !== undefined)
					conditions.push(eq(PurchasesTable.productId, input.productId));
				const orderByClauses: SQL<unknown>[] = [];
				const primarySortColumn =
					input.sortField === "quantity"
						? PurchasesTable.quantityPurchased
						: input.sortField === "cost"
							? PurchasesTable.unitCost
							: PurchasesTable.createdAt;
				const primaryOrderBy =
					input.sortDirection === "asc"
						? asc(primarySortColumn)
						: desc(primarySortColumn);
				orderByClauses.push(primaryOrderBy);
				orderByClauses.push(asc(PurchasesTable.id));
				const finalConditions = conditions.filter(
					(c): c is SQL<unknown> => c !== undefined,
				);
				const offset = (input.page - 1) * input.pageSize;
				const purchases = await ctx.db.query.PurchasesTable.findMany({
					limit: input.pageSize,
					offset: offset,
					orderBy: orderByClauses,
					where:
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					with: { product: { columns: { name: true, id: true, price: true } } },
				});
				const totalCountResult = await ctx.db
					.select({ count: sql<number>`COUNT(*)` })
					.from(PurchasesTable)
					.where(
						finalConditions.length > 0 ? and(...finalConditions) : undefined,
					)
					.get();
				const totalCount = totalCountResult?.count ?? 0;
				const totalPages = Math.ceil(totalCount / input.pageSize);
				return {
					purchases,
					pagination: {
						currentPage: input.page,
						totalPages,
						totalCount,
						hasNextPage: input.page < totalPages,
						hasPreviousPage: input.page > 1,
					},
				};
			} catch (e) {
				console.log("Error fetching paginated purchases:", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Fetching purchases failed",
					cause: e,
				});
			}
		}),

	searchPurchaseByProductName: adminProcedure
		.input(z.object({ query: z.string() }))
		.query(async ({ ctx, input }) => {
			if (!input.query) return [];
			try {
				const joinedResults = await ctx.db
					.select({
						purchase: PurchasesTable,
						product: {
							id: ProductsTable.id,
							name: ProductsTable.name,
							price: ProductsTable.price,
						},
					})
					.from(PurchasesTable)
					.innerJoin(
						ProductsTable,
						eq(PurchasesTable.productId, ProductsTable.id),
					)
					.where(like(ProductsTable.name, `%${input.query}%`))
					.orderBy(desc(PurchasesTable.createdAt))
					.limit(50);
				return joinedResults.map((item) => ({
					...item.purchase,
					product: item.product,
				}));
			} catch (e) {
				console.error("Error searching purchases:", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Searching purchases failed",
					cause: e,
				});
			}
		}),

	updatePurchase: adminProcedure
		.input(z.object({ id: z.number(), data: addPurchaseSchema }))
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.transaction(async (tx) => {
					const originalPurchases = await tx.query.PurchasesTable.findMany({
						where: and(
							eq(PurchasesTable.id, input.id),
							isNull(PurchasesTable.deletedAt),
						),
					});
					if (originalPurchases.length === 0)
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Purchase not found",
						});
					await tx
						.update(PurchasesTable)
						.set({ deletedAt: new Date() })
						.where(
							and(
								eq(PurchasesTable.id, input.id),
								isNull(PurchasesTable.deletedAt),
							),
						);
					for (const originalPurchase of originalPurchases) {
						const product = await tx.query.ProductsTable.findFirst({
							where: and(
								eq(ProductsTable.id, originalPurchase.productId),
								isNull(ProductsTable.deletedAt),
							),
							columns: { stock: true },
						});
						const newStock =
							(product?.stock || 0) - originalPurchase.quantityPurchased;
						await tx
							.update(ProductsTable)
							.set({ stock: newStock })
							.where(
								and(
									eq(ProductsTable.id, originalPurchase.productId),
									isNull(ProductsTable.deletedAt),
								),
							);
					}
					for (const product of input.data.products) {
						await tx
							.insert(PurchasesTable)
							.values({
								id: input.id,
								productId: product.productId,
								quantityPurchased: product.quantity,
								unitCost: product.unitCost,
							});
						const currentProduct = await tx.query.ProductsTable.findFirst({
							where: and(
								eq(ProductsTable.id, product.productId),
								isNull(ProductsTable.deletedAt),
							),
							columns: { stock: true },
						});
						const newStock = (currentProduct?.stock || 0) + product.quantity;
						await tx
							.update(ProductsTable)
							.set({ stock: newStock })
							.where(
								and(
									eq(ProductsTable.id, product.productId),
									isNull(ProductsTable.deletedAt),
								),
							);
					}
				});
				return { message: "Purchase updated successfully" };
			} catch (e) {
				console.error("Error updating purchase:", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Updating purchase failed",
					cause: e,
				});
			}
		}),

	deletePurchase: adminProcedure
		.input(z.object({ id: z.number() }))
		.mutation(async ({ ctx, input }) => {
			try {
				await ctx.db.transaction(async (tx) => {
					const purchase = await tx.query.PurchasesTable.findFirst({
						where: and(
							eq(PurchasesTable.id, input.id),
							isNull(PurchasesTable.deletedAt),
						),
					});
					if (!purchase)
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "Purchase not found",
						});
					await tx
						.update(PurchasesTable)
						.set({ deletedAt: new Date() })
						.where(
							and(
								eq(PurchasesTable.id, input.id),
								isNull(PurchasesTable.deletedAt),
							),
						);
					const product = await tx.query.ProductsTable.findFirst({
						where: and(
							eq(ProductsTable.id, purchase.productId),
							isNull(ProductsTable.deletedAt),
						),
						columns: { stock: true },
					});
					const newStock = (product?.stock || 0) - purchase.quantityPurchased;
					await tx
						.update(ProductsTable)
						.set({ stock: newStock })
						.where(
							and(
								eq(ProductsTable.id, purchase.productId),
								isNull(ProductsTable.deletedAt),
							),
						);
				});
				return { message: "Purchase deleted successfully" };
			} catch (e) {
				console.error("Error deleting purchase:", e);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Deleting purchase failed",
					cause: e,
				});
			}
		}),

	getAverageCostOfProduct: adminProcedure
		.input(z.object({ productId: z.number(), createdAt: z.date() }))
		.query(async ({ ctx, input }) => {
			try {
				const purchases = await ctx.db
					.select()
					.from(PurchasesTable)
					.where(
						and(
							eq(PurchasesTable.productId, input.productId),
							lt(PurchasesTable.createdAt, input.createdAt),
						),
					);
				const sum = purchases.reduce(
					(acc, purchase) =>
						acc + purchase.unitCost * purchase.quantityPurchased,
					0,
				);
				const totalProduct = purchases.reduce(
					(acc, purchase) => acc + purchase.quantityPurchased,
					0,
				);
				return totalProduct > 0 ? sum / totalProduct : 0;
			} catch (e) {
				console.error("Error calculating average cost:", e);
				return 0;
			}
		}),
});
