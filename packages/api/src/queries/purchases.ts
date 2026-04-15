import type {
	addPurchaseType,
	editPurchaseType,
	receivePurchaseType,
} from "@vit/shared/schema";
import type { SQL } from "drizzle-orm";
import {
	and,
	asc,
	desc,
	eq,
	ilike,
	inArray,
	isNull,
	or,
	sql,
} from "drizzle-orm";
import { db } from "../db/client";
import {
	ProductImagesTable,
	ProductsTable,
	PurchaseItemsTable,
	PurchaseReceiptItemsTable,
	PurchaseReceiptsTable,
	PurchasesTable,
} from "../db/schema";
import type { TransactionType } from "../lib/types";

type Transaction = TransactionType;

type PurchaseRecord = Awaited<ReturnType<typeof fetchPurchases>>[number];
type PurchaseStatus =
	| "draft"
	| "ordered"
	| "shipped"
	| "forwarder_received"
	| "partially_received"
	| "received"
	| "cancelled";

function getReceivedQuantity(
	receiptItems: Array<{ quantityReceived: number; deletedAt: Date | null }>,
) {
	return receiptItems.reduce((sum, item) => {
		if (item.deletedAt) return sum;
		return sum + item.quantityReceived;
	}, 0);
}

function derivePurchaseStatus(purchase: PurchaseRecord): PurchaseStatus {
	const itemTotals = purchase.items.map((item) => {
		const receivedQuantity = getReceivedQuantity(item.receiptItems);
		return {
			ordered: item.quantityOrdered,
			received: receivedQuantity,
		};
	});

	const allReceived =
		itemTotals.length > 0 &&
		itemTotals.every(
			(item) => item.ordered > 0 && item.received >= item.ordered,
		);
	const anyReceived = itemTotals.some((item) => item.received > 0);

	if (purchase.cancelledAt) return "cancelled";
	if (allReceived && purchase.receivedAt) return "received";
	if (anyReceived) return "partially_received";
	if (purchase.forwarderReceivedAt) return "forwarder_received";
	if (purchase.shippedAt) return "shipped";
	if (purchase.orderedAt) return "ordered";
	return "draft";
}

function shapePurchase(purchase: PurchaseRecord) {
	const items = purchase.items
		.filter((item) => !item.deletedAt)
		.map((item) => {
			const quantityReceived = getReceivedQuantity(item.receiptItems);
			return {
				id: item.id,
				productId: item.productId,
				product: item.product,
				quantityOrdered: item.quantityOrdered,
				quantityReceived,
				quantityRemaining: Math.max(item.quantityOrdered - quantityReceived, 0),
				unitCost: item.unitCost,
				lineTotal: item.unitCost * item.quantityOrdered,
				createdAt: item.createdAt,
				updatedAt: item.updatedAt,
			};
		});

	const receipts = purchase.receipts
		.filter((receipt) => !receipt.deletedAt)
		.map((receipt) => ({
			id: receipt.id,
			receivedAt: receipt.receivedAt,
			notes: receipt.notes,
			createdAt: receipt.createdAt,
			items: receipt.items
				.filter((item) => !item.deletedAt)
				.map((item) => ({
					id: item.id,
					purchaseItemId: item.purchaseItemId,
					quantityReceived: item.quantityReceived,
					productId: item.purchaseItem.productId,
					productName: item.purchaseItem.product.name,
				})),
		}));

	const merchandiseTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);

	return {
		id: purchase.id,
		provider: purchase.provider,
		externalOrderNumber: purchase.externalOrderNumber,
		trackingNumber: purchase.trackingNumber,
		shippingCost: purchase.shippingCost,
		notes: purchase.notes,
		orderedAt: purchase.orderedAt,
		shippedAt: purchase.shippedAt,
		forwarderReceivedAt: purchase.forwarderReceivedAt,
		receivedAt: purchase.receivedAt,
		cancelledAt: purchase.cancelledAt,
		createdAt: purchase.createdAt,
		updatedAt: purchase.updatedAt,
		items,
		receipts,
		itemCount: items.length,
		merchandiseTotal,
		totalCost: merchandiseTotal + purchase.shippingCost,
		status: derivePurchaseStatus(purchase),
	};
}

async function fetchPurchases(where?: SQL<unknown>) {
	return db().query.PurchasesTable.findMany({
		where,
		with: {
			items: {
				where: isNull(PurchaseItemsTable.deletedAt),
				with: {
					product: {
						columns: {
							id: true,
							name: true,
							price: true,
						},
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
					},
					receiptItems: {
						where: isNull(PurchaseReceiptItemsTable.deletedAt),
						columns: {
							id: true,
							quantityReceived: true,
							deletedAt: true,
						},
					},
				},
			},
			receipts: {
				where: isNull(PurchaseReceiptsTable.deletedAt),
				with: {
					items: {
						where: isNull(PurchaseReceiptItemsTable.deletedAt),
						with: {
							purchaseItem: {
								columns: {
									id: true,
									productId: true,
								},
								with: {
									product: {
										columns: {
											name: true,
										},
									},
								},
							},
						},
					},
				},
			},
		},
	});
}

async function syncPurchaseItems(
	tx: Transaction,
	purchaseId: number,
	items: addPurchaseType["items"] | editPurchaseType["items"],
) {
	const existingItems = await tx.query.PurchaseItemsTable.findMany({
		where: and(
			eq(PurchaseItemsTable.purchaseId, purchaseId),
			isNull(PurchaseItemsTable.deletedAt),
		),
		with: {
			receiptItems: {
				where: isNull(PurchaseReceiptItemsTable.deletedAt),
				columns: {
					quantityReceived: true,
				},
			},
		},
	});

	const existingById = new Map(existingItems.map((item) => [item.id, item]));
	const incomingIds = new Set(
		items
			.map((item) => item.id)
			.filter((itemId): itemId is number => typeof itemId === "number"),
	);

	for (const existingItem of existingItems) {
		if (incomingIds.has(existingItem.id)) continue;
		const receivedQuantity = existingItem.receiptItems.reduce(
			(sum, receiptItem) => sum + receiptItem.quantityReceived,
			0,
		);
		if (receivedQuantity > 0) {
			throw new Error("Cannot remove purchase item that has receipts");
		}
		await tx
			.update(PurchaseItemsTable)
			.set({ deletedAt: new Date() })
			.where(eq(PurchaseItemsTable.id, existingItem.id));
	}

	for (const item of items) {
		if (item.id) {
			const existingItem = existingById.get(item.id);
			if (!existingItem) {
				throw new Error("Purchase item not found");
			}
			const receivedQuantity = existingItem.receiptItems.reduce(
				(sum, receiptItem) => sum + receiptItem.quantityReceived,
				0,
			);
			if (item.quantityOrdered < receivedQuantity) {
				throw new Error(
					"Cannot reduce ordered quantity below received quantity",
				);
			}
			await tx
				.update(PurchaseItemsTable)
				.set({
					productId: item.productId,
					quantityOrdered: item.quantityOrdered,
					unitCost: item.unitCost,
					deletedAt: null,
				})
				.where(eq(PurchaseItemsTable.id, item.id));
			continue;
		}

		await tx.insert(PurchaseItemsTable).values({
			purchaseId,
			productId: item.productId,
			quantityOrdered: item.quantityOrdered,
			unitCost: item.unitCost,
		});
	}
}

async function updatePurchaseReceivedAt(tx: Transaction, purchaseId: number) {
	const items = await tx.query.PurchaseItemsTable.findMany({
		where: and(
			eq(PurchaseItemsTable.purchaseId, purchaseId),
			isNull(PurchaseItemsTable.deletedAt),
		),
		with: {
			receiptItems: {
				where: isNull(PurchaseReceiptItemsTable.deletedAt),
				columns: {
					quantityReceived: true,
				},
			},
		},
	});

	const allReceived =
		items.length > 0 &&
		items.every((item) => {
			const receivedQuantity = item.receiptItems.reduce(
				(sum, receiptItem) => sum + receiptItem.quantityReceived,
				0,
			);
			return receivedQuantity >= item.quantityOrdered;
		});

	await tx
		.update(PurchasesTable)
		.set({
			receivedAt: allReceived
				? sql`COALESCE(${PurchasesTable.receivedAt}, NOW())`
				: null,
		})
		.where(eq(PurchasesTable.id, purchaseId));
}

export const purchaseQueries = {
	admin: {
		async getAllPurchases() {
			const purchases = await fetchPurchases(
				and(
					isNull(PurchasesTable.deletedAt),
					isNull(PurchasesTable.cancelledAt),
				),
			);
			return purchases
				.map(shapePurchase)
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
		},

		async getPurchaseById(id: number) {
			const result = await fetchPurchases(
				and(eq(PurchasesTable.id, id), isNull(PurchasesTable.deletedAt)),
			);
			const purchase = result[0];
			return purchase ? shapePurchase(purchase) : null;
		},

		async getPaginatedPurchases(params: {
			page: number;
			pageSize: number;
			searchTerm?: string;
			provider?: addPurchaseType["provider"];
			status?: PurchaseStatus;
			sortField?: string;
			sortDirection: "asc" | "desc";
		}) {
			const conditions: (SQL<unknown> | undefined)[] = [
				isNull(PurchasesTable.deletedAt),
			];

			if (params.provider) {
				conditions.push(eq(PurchasesTable.provider, params.provider));
			}

			if (params.searchTerm) {
				conditions.push(
					or(
						ilike(
							PurchasesTable.externalOrderNumber,
							`%${params.searchTerm.trim()}%`,
						),
						ilike(
							PurchasesTable.trackingNumber,
							`%${params.searchTerm.trim()}%`,
						),
					),
				);
			}

			const records = await fetchPurchases(
				conditions.length > 0 ? and(...conditions) : undefined,
			);
			let purchases = records.map(shapePurchase);

			if (params.status) {
				purchases = purchases.filter(
					(purchase) => purchase.status === params.status,
				);
			} else {
				purchases = purchases.filter(
					(purchase) => purchase.status !== "cancelled",
				);
			}

			const sortMultiplier = params.sortDirection === "asc" ? 1 : -1;
			purchases.sort((a, b) => {
				const getTime = (value: Date | null | undefined) =>
					value instanceof Date ? value.getTime() : 0;
				const aValue =
					params.sortField === "orderedAt"
						? getTime(a.orderedAt)
						: params.sortField === "receivedAt"
							? getTime(a.receivedAt)
							: getTime(a.createdAt);
				const bValue =
					params.sortField === "orderedAt"
						? getTime(b.orderedAt)
						: params.sortField === "receivedAt"
							? getTime(b.receivedAt)
							: getTime(b.createdAt);
				return (aValue - bValue) * sortMultiplier;
			});

			const totalCount = purchases.length;
			const totalPages = Math.ceil(totalCount / params.pageSize);
			const offset = (params.page - 1) * params.pageSize;

			return {
				purchases: purchases.slice(offset, offset + params.pageSize),
				pagination: {
					currentPage: params.page,
					totalPages,
					totalCount,
					hasNextPage: params.page < totalPages,
					hasPreviousPage: params.page > 1,
				},
			};
		},

		async searchPurchases(query: string) {
			const trimmed = query.trim();
			if (!trimmed) return [];
			const records = await fetchPurchases(
				and(
					isNull(PurchasesTable.deletedAt),
					or(
						ilike(PurchasesTable.externalOrderNumber, `%${trimmed}%`),
						ilike(PurchasesTable.trackingNumber, `%${trimmed}%`),
					),
				),
			);
			return records.map(shapePurchase).slice(0, 50);
		},

		async createPurchase(tx: Transaction, input: addPurchaseType) {
			const result = await tx
				.insert(PurchasesTable)
				.values({
					provider: input.provider,
					externalOrderNumber: input.externalOrderNumber,
					trackingNumber: input.trackingNumber ?? null,
					shippingCost: input.shippingCost,
					notes: input.notes ?? null,
					orderedAt: input.orderedAt ?? null,
					shippedAt: input.shippedAt ?? null,
					forwarderReceivedAt: input.forwarderReceivedAt ?? null,
					receivedAt: input.receivedAt ?? null,
					cancelledAt: input.cancelledAt ?? null,
				})
				.returning({ id: PurchasesTable.id });

			const purchaseId = result[0]?.id;
			if (!purchaseId) throw new Error("Purchase creation failed");

			await tx.insert(PurchaseItemsTable).values(
				input.items.map((item) => ({
					purchaseId,
					productId: item.productId,
					quantityOrdered: item.quantityOrdered,
					unitCost: item.unitCost,
				})),
			);

			return { id: purchaseId };
		},

		async updatePurchase(
			tx: Transaction,
			purchaseId: number,
			input: editPurchaseType,
		) {
			const purchase = await tx.query.PurchasesTable.findFirst({
				where: and(
					eq(PurchasesTable.id, purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
			});

			if (!purchase) {
				throw new Error("Purchase not found");
			}

			await tx
				.update(PurchasesTable)
				.set({
					provider: input.provider,
					externalOrderNumber: input.externalOrderNumber,
					trackingNumber: input.trackingNumber ?? null,
					shippingCost: input.shippingCost,
					notes: input.notes ?? null,
					orderedAt: input.orderedAt ?? null,
					shippedAt: input.shippedAt ?? null,
					forwarderReceivedAt: input.forwarderReceivedAt ?? null,
					receivedAt: input.receivedAt ?? null,
					cancelledAt: input.cancelledAt ?? null,
				})
				.where(eq(PurchasesTable.id, purchaseId));

			await syncPurchaseItems(tx, purchaseId, input.items);
			await updatePurchaseReceivedAt(tx, purchaseId);
		},

		async receivePurchase(tx: Transaction, input: receivePurchaseType) {
			const purchase = await tx.query.PurchasesTable.findFirst({
				where: and(
					eq(PurchasesTable.id, input.purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
			});

			if (!purchase) {
				throw new Error("Purchase not found");
			}

			if (purchase.cancelledAt) {
				throw new Error("Cancelled purchase cannot receive items");
			}

			const receiptResult = await tx
				.insert(PurchaseReceiptsTable)
				.values({
					purchaseId: input.purchaseId,
					receivedAt: input.receivedAt,
					notes: input.notes ?? null,
				})
				.returning({ id: PurchaseReceiptsTable.id });

			const receiptId = receiptResult[0]?.id;
			if (!receiptId) {
				throw new Error("Receipt creation failed");
			}

			const purchaseItemIds = input.items.map((item) => item.purchaseItemId);
			const purchaseItems = await tx.query.PurchaseItemsTable.findMany({
				where: and(
					eq(PurchaseItemsTable.purchaseId, input.purchaseId),
					inArray(PurchaseItemsTable.id, purchaseItemIds),
					isNull(PurchaseItemsTable.deletedAt),
				),
				with: {
					receiptItems: {
						where: isNull(PurchaseReceiptItemsTable.deletedAt),
						columns: {
							quantityReceived: true,
						},
					},
				},
			});

			if (purchaseItems.length !== input.items.length) {
				throw new Error("Receipt items do not match purchase items");
			}

			const itemsById = new Map(purchaseItems.map((item) => [item.id, item]));

			for (const receiptItem of input.items) {
				const purchaseItem = itemsById.get(receiptItem.purchaseItemId);
				if (!purchaseItem) {
					throw new Error("Purchase item not found");
				}
				const receivedSoFar = purchaseItem.receiptItems.reduce(
					(sum, item) => sum + item.quantityReceived,
					0,
				);
				const remainingQuantity = purchaseItem.quantityOrdered - receivedSoFar;
				if (receiptItem.quantityReceived > remainingQuantity) {
					throw new Error("Cannot receive more than remaining quantity");
				}
			}

			await tx.insert(PurchaseReceiptItemsTable).values(
				input.items.map((item) => ({
					receiptId,
					purchaseItemId: item.purchaseItemId,
					quantityReceived: item.quantityReceived,
				})),
			);

			for (const receiptItem of input.items) {
				const purchaseItem = itemsById.get(receiptItem.purchaseItemId);
				if (!purchaseItem) continue;
				const product = await tx.query.ProductsTable.findFirst({
					where: and(
						eq(ProductsTable.id, purchaseItem.productId),
						isNull(ProductsTable.deletedAt),
					),
					columns: {
						stock: true,
					},
				});
				await tx
					.update(ProductsTable)
					.set({
						stock: (product?.stock ?? 0) + receiptItem.quantityReceived,
					})
					.where(eq(ProductsTable.id, purchaseItem.productId));
			}

			await updatePurchaseReceivedAt(tx, input.purchaseId);
		},

		async deletePurchase(tx: Transaction, purchaseId: number) {
			const purchase = await tx.query.PurchasesTable.findFirst({
				where: and(
					eq(PurchasesTable.id, purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
				with: {
					receipts: {
						where: isNull(PurchaseReceiptsTable.deletedAt),
						columns: {
							id: true,
						},
					},
					items: {
						where: isNull(PurchaseItemsTable.deletedAt),
						columns: {
							id: true,
						},
					},
				},
			});

			if (!purchase) {
				throw new Error("Purchase not found");
			}

			if (purchase.receipts.length > 0) {
				throw new Error("Cannot delete purchase with receipts");
			}

			await tx
				.update(PurchasesTable)
				.set({ deletedAt: new Date() })
				.where(eq(PurchasesTable.id, purchaseId));

			await tx
				.update(PurchaseItemsTable)
				.set({ deletedAt: new Date() })
				.where(eq(PurchaseItemsTable.purchaseId, purchaseId));
		},

		async cancelPurchase(tx: Transaction, purchaseId: number) {
			const purchase = await tx.query.PurchasesTable.findFirst({
				where: and(
					eq(PurchasesTable.id, purchaseId),
					isNull(PurchasesTable.deletedAt),
				),
			});
			if (!purchase) throw new Error("Purchase not found");

			await tx
				.update(PurchasesTable)
				.set({ cancelledAt: new Date() })
				.where(eq(PurchasesTable.id, purchaseId));
		},

		async markPurchaseShipped(
			tx: Transaction,
			purchaseId: number,
			shippedAt: Date,
		) {
			await tx
				.update(PurchasesTable)
				.set({ shippedAt })
				.where(eq(PurchasesTable.id, purchaseId));
		},

		async markPurchaseForwarderReceived(
			tx: Transaction,
			purchaseId: number,
			forwarderReceivedAt: Date,
		) {
			await tx
				.update(PurchasesTable)
				.set({ forwarderReceivedAt })
				.where(eq(PurchasesTable.id, purchaseId));
		},

		async getAverageCostOfProduct(productId: number, createdAt: Date) {
			const purchaseItems = await db().query.PurchaseItemsTable.findMany({
				where: and(
					eq(PurchaseItemsTable.productId, productId),
					isNull(PurchaseItemsTable.deletedAt),
				),
				with: {
					purchase: {
						columns: {
							orderedAt: true,
							createdAt: true,
							cancelledAt: true,
							deletedAt: true,
						},
					},
					receiptItems: {
						where: isNull(PurchaseReceiptItemsTable.deletedAt),
						columns: {
							quantityReceived: true,
						},
					},
				},
			});

			const eligibleItems = purchaseItems.filter((item) => {
				if (item.purchase.deletedAt) return false;
				const effectiveDate =
					item.purchase.orderedAt ?? item.purchase.createdAt;
				return effectiveDate < createdAt;
			});

			const totals = eligibleItems.reduce(
				(acc, item) => {
					const receivedQuantity = item.receiptItems.reduce(
						(sum, receiptItem) => sum + receiptItem.quantityReceived,
						0,
					);
					const effectiveQuantity = item.purchase.cancelledAt
						? receivedQuantity
						: item.quantityOrdered;
					acc.totalCost += effectiveQuantity * item.unitCost;
					acc.totalQuantity += effectiveQuantity;
					return acc;
				},
				{ totalCost: 0, totalQuantity: 0 },
			);

			return totals.totalQuantity > 0
				? totals.totalCost / totals.totalQuantity
				: 0;
		},
	},
};
