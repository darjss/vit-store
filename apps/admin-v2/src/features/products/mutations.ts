import type { editableProductFields } from "@vit/shared/constants";
import type { addProductSchema, updateProductSchema } from "@vit/shared/schema";
import type * as v from "valibot";

import { api } from "@/lib/trpc";

export type EditableProductField = (typeof editableProductFields)[number];
export type AddProductInput = v.InferInput<typeof addProductSchema>;
export type UpdateProductInput = v.InferInput<typeof updateProductSchema>;

/*
 * Mutation option factories (plan: separate mutation modules). Solid Query
 * does not export `mutationOptions`, so these return plain option objects
 * that components spread into createMutation.
 */
export function setProductStockMutationOptions() {
	return {
		mutationFn: (input: { id: number; newStock: number }) =>
			api.product.setProductStock.mutate(input),
	} as const;
}

export function updateProductFieldMutationOptions() {
	return {
		mutationFn: (input: {
			id: number;
			field: EditableProductField;
			stringValue?: string;
			numberValue?: number;
		}) => api.product.updateProductField.mutate(input),
	} as const;
}

export function deleteProductMutationOptions() {
	return {
		mutationFn: (input: { id: number }) =>
			api.product.deleteProduct.mutate(input),
	} as const;
}

export function addProductMutationOptions() {
	return {
		mutationFn: (input: AddProductInput) =>
			api.product.addProduct.mutate(input),
	} as const;
}

export function updateProductMutationOptions() {
	return {
		mutationFn: (input: UpdateProductInput) =>
			api.product.updateProduct.mutate(input),
	} as const;
}
