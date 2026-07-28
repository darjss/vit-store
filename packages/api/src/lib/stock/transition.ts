import type { StockTransitionError } from "@vit/shared";
import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";
import { and, eq, isNull } from "drizzle-orm";
import { ProductsTable } from "~/db/schema";
import type { TransactionType } from "~/lib/types";

export type StockTransition = {
	productId: number;
	previousStock: number;
	newStock: number;
};

export class StockTransitionRejected extends Error {
	constructor(readonly failure: StockTransitionError) {
		super(`Stock transition rejected: ${failure._tag}`);
		this.name = "StockTransitionRejected";
	}
}

export type StockTransitionInput = {
	productId: number;
	setTo?: number;
	delta?: number;
	requireActive?: boolean;
	requireNonNegative?: boolean;
};

export const planStockTransition = (
	product: { stock: number; status: string } | undefined,
	input: StockTransitionInput,
): ResultType<
	{ previousStock: number; newStock: number },
	StockTransitionError
> => {
	if (!product) {
		return Result.err({
			_tag: "ProductNotFound",
			productId: input.productId,
		} satisfies StockTransitionError);
	}
	if (input.requireActive && product.status !== "active") {
		return Result.err({
			_tag: "ProductInactive",
			productId: input.productId,
		} satisfies StockTransitionError);
	}
	const delta =
		input.setTo === undefined
			? (input.delta ?? 0)
			: input.setTo - product.stock;
	const newStock = product.stock + delta;
	if (input.requireNonNegative && newStock < 0) {
		return Result.err({
			_tag: "InsufficientStock",
			productId: input.productId,
			current: product.stock,
			delta,
		} satisfies StockTransitionError);
	}
	return Result.ok({ previousStock: product.stock, newStock });
};

export async function applyStockTransition(
	tx: TransactionType,
	input: StockTransitionInput,
): Promise<ResultType<StockTransition, StockTransitionError>> {
	const [product] = await tx
		.select({ stock: ProductsTable.stock, status: ProductsTable.status })
		.from(ProductsTable)
		.where(
			and(
				eq(ProductsTable.id, input.productId),
				isNull(ProductsTable.deletedAt),
			),
		)
		.for("update");

	const planned = planStockTransition(product, input);
	if (planned.isErr()) return Result.err(planned.error);

	const [updated] = await tx
		.update(ProductsTable)
		.set({ stock: planned.value.newStock })
		.where(
			and(
				eq(ProductsTable.id, input.productId),
				isNull(ProductsTable.deletedAt),
			),
		)
		.returning({ stock: ProductsTable.stock });
	if (!updated) {
		return Result.err({
			_tag: "ConcurrentStockUpdate",
			productId: input.productId,
		} satisfies StockTransitionError);
	}

	return Result.ok({
		productId: input.productId,
		previousStock: planned.value.previousStock,
		newStock: updated.stock,
	});
}

/** Throw only at transaction boundaries that must roll back atomically. */
export const requireStockTransition = (
	result: ResultType<StockTransition, StockTransitionError>,
) => {
	if (result.isOk()) return result.value;
	return match(
		result.error,
		"_tag",
	)<never>({
		ProductNotFound: (error) => {
			throw new StockTransitionRejected(error);
		},
		ProductInactive: (error) => {
			throw new StockTransitionRejected(error);
		},
		InsufficientStock: (error) => {
			throw new StockTransitionRejected(error);
		},
		ConcurrentStockUpdate: (error) => {
			throw new StockTransitionRejected(error);
		},
	});
};
