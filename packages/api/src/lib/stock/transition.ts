import { and, eq, isNull } from "drizzle-orm";
import { ProductsTable } from "~/db/schema";
import type { TransactionType } from "~/lib/types";

export type StockTransition = {
	newStock: number;
	previousStock: number;
	productId: number;
};

export async function applyStockTransition(
	tx: TransactionType,
	input: {
		delta?: number;
		productId: number;
		requireActive?: boolean;
		requireNonNegative?: boolean;
		setTo?: number;
	},
): Promise<StockTransition | null> {
	const [product] = await tx
		.select({ status: ProductsTable.status, stock: ProductsTable.stock })
		.from(ProductsTable)
		.where(and(eq(ProductsTable.id, input.productId), isNull(ProductsTable.deletedAt)))
		.for("update");
	if (!product || (input.requireActive && product.status !== "active")) {
		return null;
	}

	const newStock = input.setTo ?? product.stock + (input.delta ?? 0);
	if (input.requireNonNegative && newStock < 0) {
		return null;
	}

	const [updated] = await tx
		.update(ProductsTable)
		.set({ stock: newStock })
		.where(and(eq(ProductsTable.id, input.productId), isNull(ProductsTable.deletedAt)))
		.returning({ stock: ProductsTable.stock });
	if (!updated) {
		return null;
	}
	return {
		newStock: updated.stock,
		previousStock: product.stock,
		productId: input.productId,
	};
}
