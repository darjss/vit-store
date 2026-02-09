import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, isNull, like, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { ProductsTable, PurchasesTable } from "../db/schema";
import type { TransactionType } from "../lib/types";

type Transaction = TransactionType;

export const purchaseQueries = {
	admin: {
		async getAllPurchases() {
			return db().query.PurchasesTable.findMany({
				where: isNull(PurchasesTable.deletedAt),
				with: {
					product: { columns: { name: true, id: true, price: true } },
				},
				orderBy: desc(PurchasesTable.createdAt),
			});
		},

		async getPurchaseById(id: number) {
			return db().query.PurchasesTable.findFirst({
				where: and(eq(PurchasesTable.id, id), isNull(PurchasesTable.deletedAt)),
				with: { product: { columns: { name: true, id: true, price: true } } },
			});
		},

		async getPaginatedPurchases(params: {
			page: number;
			pageSize: number;
			productId?: number;
			sortField?: string;
			sortDirection: "asc" | "desc";
		}) {
			const conditions: (SQL<unknown> | undefined)[] = [
				isNull(PurchasesTable.deletedAt) as unknown as SQL<unknown>,
			];
			if (params.productId !== undefined)
				conditions.push(eq(PurchasesTable.productId, params.productId));
			const orderByClauses: SQL<unknown>[] = [];
			const primarySortColumn =
				params.sortField === "quantity"
					? PurchasesTable.quantityPurchased
					: params.sortField === "cost"
						? PurchasesTable.unitCost
						: PurchasesTable.createdAt;
			const primaryOrderBy =
				params.sortDirection === "asc"
					? asc(primarySortColumn)
					: desc(primarySortColumn);
			orderByClauses.push(primaryOrderBy);
			orderByClauses.push(asc(PurchasesTable.id));
			const finalConditions = conditions.filter(
				(c): c is SQL<unknown> => c !== undefined,
			);
			const offset = (params.page - 1) * params.pageSize;
			const purchases = await db().query.PurchasesTable.findMany({
				limit: params.pageSize,
				offset: offset,
				orderBy: orderByClauses,
				where: finalConditions.length > 0 ? and(...finalConditions) : undefined,
				with: { product: { columns: { name: true, id: true, price: true } } },
			});
			const totalCountResult = await db()
				.select({ count: sql<number>`COUNT(*)` })
				.from(PurchasesTable)
				.where(finalConditions.length > 0 ? and(...finalConditions) : undefined)
				.limit(1);
			const totalCount = totalCountResult[0]?.count ?? 0;
			const totalPages = Math.ceil(totalCount / params.pageSize);
			return {
				purchases,
				pagination: {
					currentPage: params.page,
					totalPages,
					totalCount,
					hasNextPage: params.page < totalPages,
					hasPreviousPage: params.page > 1,
				},
			};
		},

		async searchByProductName(query: string) {
			if (!query) return [];
			const joinedResults = await db()
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
				.where(like(ProductsTable.name, `%${query}%`))
				.orderBy(desc(PurchasesTable.createdAt))
				.limit(50);
			return joinedResults.map((item) => ({
				...item.purchase,
				product: item.product,
			}));
		},

		async getAverageCostOfProduct(productId: number, createdAt: Date) {
			const purchases = await db()
				.select()
				.from(PurchasesTable)
				.where(
					and(
						eq(PurchasesTable.productId, productId),
						lt(PurchasesTable.createdAt, createdAt),
					),
				);
			const sum = purchases.reduce(
				(acc, purchase) => acc + purchase.unitCost * purchase.quantityPurchased,
				0,
			);
			const totalProduct = purchases.reduce(
				(acc, purchase) => acc + purchase.quantityPurchased,
				0,
			);
			return totalProduct > 0 ? sum / totalProduct : 0;
		},

		async addPurchaseWithStockUpdate(
			tx: Transaction,
			products: Array<{
				productId: number;
				quantity: number;
				unitCost: number;
			}>,
		) {
			for (const product of products) {
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
		},

		async updatePurchaseWithStockAdjustment(
			tx: Transaction,
			purchaseId: number,
			products: Array<{
				productId: number;
				quantity: number;
				unitCost: number;
			}>,
		) {
			const originalPurchases = await tx.query.PurchasesTable.findMany({
				where: and(
					eq(PurchasesTable.id, purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
			});

			if (originalPurchases.length === 0) {
				throw new Error("Purchase not found");
			}

			// Soft delete original purchases
			await tx
				.update(PurchasesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(PurchasesTable.id, purchaseId),
						isNull(PurchasesTable.deletedAt),
					),
				);

			// Restore stock from original purchases
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

			// Add new purchases and update stock
			for (const product of products) {
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
		},

		async deletePurchaseWithStockRestore(tx: Transaction, purchaseId: number) {
			const purchase = await tx.query.PurchasesTable.findFirst({
				where: and(
					eq(PurchasesTable.id, purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
			});

			if (!purchase) {
				throw new Error("Purchase not found");
			}

			// Soft delete purchase
			await tx
				.update(PurchasesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(PurchasesTable.id, purchaseId),
						isNull(PurchasesTable.deletedAt),
					),
				);

			// Restore stock
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
		},
	},
};
