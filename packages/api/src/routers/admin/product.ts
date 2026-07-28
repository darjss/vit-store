import { TRPCError } from "@trpc/server";
import { addProductSchema, status, updateProductSchema } from "@vit/shared";
import * as v from "valibot";
import { PRODUCT_PER_PAGE, editableProductFields } from "~/lib/constants";
import type { Context } from "~/lib/context";
import { searchProducts } from "~/lib/product-search/client";
import { getRestockWaitCount, listRestockWaitlist } from "~/lib/restock";
import {
	adminProcedure,
	baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import {
	addProduct,
	catalogErrorToLegacyTrpc,
	deleteProduct,
	productCreatedResultSchemas,
	productMutationResultSchemas,
	setProductStock,
	updateProduct,
	updateProductField,
	updateProductStock,
} from "~/operations/admin-catalog";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { productQueries } from "~/queries/products";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const runRead = async <Value>(
	ctx: Context,
	event: string,
	failureMessage: string,
	read: () => Promise<Value>,
) => {
	try {
		return await read();
	} catch (error) {
		if (error instanceof TRPCError) throw error;
		ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
			event,
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: failureMessage,
			cause: error,
		});
	}
};

const updateStockInputSchema = v.object({
	productId: v.number(),
	numberToUpdate: v.number(),
	type: v.picklist(["add", "minus"]),
});
const productIdInputSchema = v.object({ id: v.number() });
const setStockInputSchema = v.object({ id: v.number(), newStock: v.number() });
const updateProductFieldInputSchema = v.object({
	id: v.number(),
	field: v.picklist(editableProductFields),
	stringValue: v.optional(v.string()),
	numberValue: v.optional(v.number()),
});

export function buildProductRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		searchProductByName: proc
			.input(v.object({ searchTerm: v.string() }))
			.query(({ ctx, input }) =>
				runRead(ctx, "searchProductByName", "Failed to search products", () =>
					productQueries.admin.searchByName(input.searchTerm, 3),
				),
			),
		searchProductByNameForOrder: proc
			.input(v.object({ searchTerm: v.string() }))
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"searchProductByNameForOrder",
					"Failed to search products for order",
					() => productQueries.admin.searchByNameForOrder(input.searchTerm, 3),
				),
			),
		searchProductsInstant: proc
			.input(
				v.object({
					query: v.pipe(v.string(), v.minLength(1)),
					limit: v.optional(v.number(), 10),
					brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
					categoryId: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(1)),
					),
					status: v.optional(v.picklist(status)),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"searchProductsInstant",
					"Failed to search products",
					async () => {
						const safeLimit = Math.min(input.limit, 10);
						const results = await searchProducts(input.query, safeLimit, {
							brandId: input.brandId,
							categoryId: input.categoryId,
						});
						return results
							.filter(
								(result) => !input.status || result.status === input.status,
							)
							.map((result) => ({
								id: result.id,
								name: result.name,
								slug: result.slug,
								price: result.price,
								stock: result.stock,
								status: result.status,
								images: result.image ? [{ url: result.image }] : [],
							}))
							.slice(0, safeLimit);
					},
				),
			),
		addProduct: proc
			.input(addProductSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"addProduct",
					"Failed to add product",
					() => addProduct(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		getProductBenchmark: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"getProductBenchmark",
				"Failed to run benchmark",
				async () => {
					const startedAt = performance.now();
					await productQueries.admin.getProductBenchmark();
					return performance.now() - startedAt;
				},
			),
		),
		getProductById: proc.input(productIdInputSchema).query(({ ctx, input }) =>
			runRead(ctx, "getProductById", "Failed to fetch product", async () => {
				const product = await productQueries.admin.getProductById(input.id);
				if (!product) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Product not found",
					});
				}
				return product;
			}),
		),
		updateProduct: proc
			.input(updateProductSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateProduct",
					"Failed to update product",
					() => updateProduct(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		updateStock: proc
			.input(updateStockInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateStock",
					"Failed to update stock",
					() => updateProductStock(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		deleteProduct: proc
			.input(productIdInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"deleteProduct",
					"Failed to delete product",
					() => deleteProduct(ctx, input.id),
					catalogErrorToLegacyTrpc,
				),
			),
		getAllProducts: proc.query(({ ctx }) =>
			runRead(ctx, "getAllProducts", "Failed to fetch products", () =>
				productQueries.admin.getAllProducts(),
			),
		),
		getPaginatedProducts: proc
			.input(
				v.object({
					page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
					pageSize: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(1)),
						PRODUCT_PER_PAGE,
					),
					brandId: v.optional(v.number()),
					categoryId: v.optional(v.number()),
					status: v.optional(v.picklist(status)),
					sortField: v.optional(v.string()),
					sortDirection: v.optional(v.picklist(["asc", "desc"])),
					searchTerm: v.optional(v.string()),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"getPaginatedProducts",
					"Failed to fetch paginated products",
					() =>
						productQueries.admin.getPaginatedProducts({
							page: input.page ?? 1,
							pageSize: input.pageSize ?? PRODUCT_PER_PAGE,
							brandId: input.brandId,
							categoryId: input.categoryId,
							status: input.status,
							sortField: input.sortField,
							sortDirection: input.sortDirection ?? "desc",
							searchTerm: input.searchTerm,
						}),
				),
			),
		setProductStock: proc
			.input(setStockInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"setProductStock",
					"Failed to set product stock",
					() => setProductStock(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
		getRestockWaitCount: proc
			.input(
				v.object({
					productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"getRestockWaitCount",
					"Failed to fetch restock wait count",
					async () => ({
						productId: input.productId,
						waitCount: await getRestockWaitCount(input.productId),
					}),
				),
			),
		listRestockWaitlist: proc
			.input(
				v.object({
					limit: v.optional(
						v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(200)),
						50,
					),
				}),
			)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"listRestockWaitlist",
					"Failed to fetch restock waitlist",
					() => listRestockWaitlist(input.limit ?? 50),
				),
			),
		getAllProductValue: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"getAllProductValue",
				"Failed to calculate product value",
				() => productQueries.admin.getAllProductValue(),
			),
		),
		getReviewProducts: proc.query(({ ctx }) =>
			runRead(ctx, "getReviewProducts", "Failed to fetch review products", () =>
				productQueries.admin.getReviewProducts(),
			),
		),
		updateProductField: proc
			.input(updateProductFieldInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"updateProductField",
					"Failed to update product field",
					() => updateProductField(ctx, input),
					catalogErrorToLegacyTrpc,
				),
			),
	});
}

export const productV2 = router({
	addProduct: adminProcedure
		.input(addProductSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await addProduct(ctx, input),
				productCreatedResultSchemas,
				{ operation: "admin.product.add", error_layer: "domain" },
			),
		),
	updateProduct: adminProcedure
		.input(updateProductSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateProduct(ctx, input),
				productMutationResultSchemas,
				{ operation: "admin.product.update", error_layer: "domain" },
			),
		),
	updateStock: adminProcedure
		.input(updateStockInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateProductStock(ctx, input),
				productMutationResultSchemas,
				{ operation: "admin.product.adjust_stock", error_layer: "domain" },
			),
		),
	deleteProduct: adminProcedure
		.input(productIdInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await deleteProduct(ctx, input.id),
				productMutationResultSchemas,
				{ operation: "admin.product.delete", error_layer: "domain" },
			),
		),
	setProductStock: adminProcedure
		.input(setStockInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await setProductStock(ctx, input),
				productMutationResultSchemas,
				{ operation: "admin.product.set_stock", error_layer: "domain" },
			),
		),
	updateProductField: adminProcedure
		.input(updateProductFieldInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await updateProductField(ctx, input),
				productMutationResultSchemas,
				{ operation: "admin.product.update_field", error_layer: "domain" },
			),
		),
});

export const product = buildProductRouter(adminProcedure);
export const productBot = buildProductRouter(botProcedure);
