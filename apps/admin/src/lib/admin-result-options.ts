import {
	adminBatchSuccessSchema,
	adminBooleanSuccessSchema,
	adminCreatedSuccessSchema,
	adminCustomerCreatedSchema,
	adminCustomerSchema,
	adminCustomerUpdatedSchema,
	adminMutationSuccessSchema,
	adminOrderErrorSchema,
	adminShipOrderSuccessSchema,
	aiExtractionProgressSchema,
	aiExtractionStartSchema,
	aiExtractedPurchaseSchema,
	aiOperationErrorSchema,
	regeneratedProductImagesSchema,
	catalogMutationErrorSchema,
	extractedProductDataSchema,
	paymentErrorSchema,
	purchaseErrorSchema,
	type addBrandType,
	type addCategoryType,
	type addOrderType,
	type addProductInputType,
	type addPurchaseType,
	type extractPurchaseFromImagesType,
	type patchOrderHeaderType,
	type receivePurchaseType,
	type saveExtractedPurchaseType,
	type updateOrderType,
	type updateProductInputType,
	editableProductFields,
} from "@vit/shared";
import { resultMutationOptions, resultQueryOptions } from "@/lib/result-query";
import { trpcClient } from "@/utils/trpc";

const purchaseCreatedSchemas = {
	value: adminCreatedSuccessSchema,
	error: purchaseErrorSchema,
};
const purchaseMutationSchemas = {
	value: adminMutationSuccessSchema,
	error: purchaseErrorSchema,
};
const aiPurchaseExtractSchemas = {
	value: aiExtractedPurchaseSchema,
	error: aiOperationErrorSchema,
};
const aiPurchaseCreatedSchemas = {
	value: adminCreatedSuccessSchema,
	error: aiOperationErrorSchema,
};
const orderMutationSchemas = {
	value: adminMutationSuccessSchema,
	error: adminOrderErrorSchema,
};
const shipOrderSchemas = {
	value: adminShipOrderSuccessSchema,
	error: adminOrderErrorSchema,
};
const orderBatchSchemas = {
	value: adminBatchSuccessSchema,
	error: adminOrderErrorSchema,
};
const paymentReviewSchemas = {
	value: adminBooleanSuccessSchema,
	error: paymentErrorSchema,
};
const productCreatedSchemas = {
	value: adminCreatedSuccessSchema,
	error: catalogMutationErrorSchema,
};
const customerCreatedSchemas = {
	value: adminCustomerCreatedSchema,
	error: catalogMutationErrorSchema,
};
const customerUpdatedSchemas = {
	value: adminCustomerUpdatedSchema,
	error: catalogMutationErrorSchema,
};
const aiExtractionStartSchemas = {
	value: aiExtractionStartSchema,
	error: aiOperationErrorSchema,
};
const aiExtractionProgressSchemas = {
	value: aiExtractionProgressSchema,
	error: aiOperationErrorSchema,
};
const aiExtractedProductSchemas = {
	value: extractedProductDataSchema,
	error: aiOperationErrorSchema,
};
const aiRegeneratedImagesSchemas = {
	value: regeneratedProductImagesSchema,
	error: aiOperationErrorSchema,
};
const customerLookupSchemas = {
	value: adminCustomerSchema,
	error: catalogMutationErrorSchema,
};
const catalogMutationSchemas = {
	value: adminMutationSuccessSchema,
	error: catalogMutationErrorSchema,
};

export const customerLookupQueryOptions = (phone: number) =>
	resultQueryOptions({
		queryKey: ["admin", "v2", "customer", "phone", phone] as const,
		request: () => trpcClient.v2.customer.getCustomerByPhone.query({ phone }),
		schemas: customerLookupSchemas,
	});

export const addPurchaseMutationOptions = resultMutationOptions(
	(input: addPurchaseType) => trpcClient.v2.purchase.addPurchase.mutate(input),
	purchaseCreatedSchemas,
);

export const updatePurchaseMutationOptions = resultMutationOptions(
	(input: { id: number; data: addPurchaseType }) =>
		trpcClient.v2.purchase.updatePurchase.mutate(input),
	purchaseMutationSchemas,
);

export const receivePurchaseMutationOptions = resultMutationOptions(
	(input: receivePurchaseType) =>
		trpcClient.v2.purchase.receivePurchase.mutate(input),
	purchaseMutationSchemas,
);

export const deletePurchaseMutationOptions = resultMutationOptions(
	(input: { id: number }) =>
		trpcClient.v2.purchase.deletePurchase.mutate(input),
	purchaseMutationSchemas,
);

export const cancelPurchaseMutationOptions = resultMutationOptions(
	(input: { id: number }) =>
		trpcClient.v2.purchase.cancelPurchase.mutate(input),
	purchaseMutationSchemas,
);

export const markPurchaseShippedMutationOptions = resultMutationOptions(
	(input: { id: number; shippedAt: Date }) =>
		trpcClient.v2.purchase.markPurchaseShipped.mutate(input),
	purchaseMutationSchemas,
);

export const markPurchaseForwarderMutationOptions = resultMutationOptions(
	(input: { id: number; forwarderReceivedAt: Date }) =>
		trpcClient.v2.purchase.markPurchaseForwarderReceived.mutate(input),
	purchaseMutationSchemas,
);

export const extractPurchaseMutationOptions = resultMutationOptions(
	(input: extractPurchaseFromImagesType) =>
		trpcClient.v2.aiPurchase.extractPurchaseFromImages.mutate(input),
	aiPurchaseExtractSchemas,
);

export const saveExtractedPurchaseMutationOptions = resultMutationOptions(
	(input: saveExtractedPurchaseType) =>
		trpcClient.v2.aiPurchase.saveExtractedPurchase.mutate(input),
	aiPurchaseCreatedSchemas,
);

export const confirmTransferMutationOptions = resultMutationOptions(
	(input: { paymentNumber: string }) =>
		trpcClient.v2.payment.confirmTransferPayment.mutate(input),
	paymentReviewSchemas,
);

export const rejectTransferMutationOptions = resultMutationOptions(
	(input: { paymentNumber: string }) =>
		trpcClient.v2.payment.rejectTransferPayment.mutate(input),
	paymentReviewSchemas,
);

export const addOrderMutationOptions = resultMutationOptions(
	(input: addOrderType) => trpcClient.v2.order.addOrder.mutate(input),
	orderMutationSchemas,
);

export const updateOrderMutationOptions = resultMutationOptions(
	(input: updateOrderType) => trpcClient.v2.order.updateOrder.mutate(input),
	orderMutationSchemas,
);

export const patchOrderHeaderMutationOptions = resultMutationOptions(
	(input: patchOrderHeaderType) =>
		trpcClient.v2.order.patchOrderHeader.mutate(input),
	orderMutationSchemas,
);

export const deleteOrderMutationOptions = resultMutationOptions(
	(input: { id: number }) => trpcClient.v2.order.deleteOrder.mutate(input),
	orderMutationSchemas,
);

export const updateOrderStatusMutationOptions = resultMutationOptions(
	(input: {
		id: number;
		status: "pending" | "shipped" | "delivered" | "cancelled" | "refunded";
	}) => trpcClient.v2.order.updateOrderStatus.mutate(input),
	orderMutationSchemas,
);

export const shipOrderMutationOptions = resultMutationOptions(
	(input: { orderId: number }) => trpcClient.v2.order.shipOrder.mutate(input),
	shipOrderSchemas,
);

type BatchOrderInput = {
	orders: Array<{ id: number; orderNumber: string }>;
};

export const batchShipOrdersMutationOptions = resultMutationOptions(
	(input: BatchOrderInput) => trpcClient.v2.order.batchShipOrders.mutate(input),
	orderBatchSchemas,
);

export const batchUpdateOrderStatusMutationOptions = resultMutationOptions(
	(
		input: BatchOrderInput & {
			status: "pending" | "shipped" | "delivered" | "cancelled" | "refunded";
		},
	) => trpcClient.v2.order.batchUpdateOrderStatus.mutate(input),
	orderBatchSchemas,
);

export const deleteProductMutationOptions = resultMutationOptions(
	(input: { id: number }) => trpcClient.v2.product.deleteProduct.mutate(input),
	catalogMutationSchemas,
);

export const setProductStockMutationOptions = resultMutationOptions(
	(input: { id: number; newStock: number }) =>
		trpcClient.v2.product.setProductStock.mutate(input),
	catalogMutationSchemas,
);

export const addProductMutationOptions = resultMutationOptions(
	(input: addProductInputType) =>
		trpcClient.v2.product.addProduct.mutate(input),
	productCreatedSchemas,
);

export const updateProductMutationOptions = resultMutationOptions(
	(input: updateProductInputType) =>
		trpcClient.v2.product.updateProduct.mutate(input),
	catalogMutationSchemas,
);

export const updateProductFieldMutationOptions = resultMutationOptions(
	(input: {
		id: number;
		field: (typeof editableProductFields)[number];
		stringValue?: string;
		numberValue?: number;
	}) => trpcClient.v2.product.updateProductField.mutate(input),
	catalogMutationSchemas,
);

export const addBrandMutationOptions = resultMutationOptions(
	(input: addBrandType) => trpcClient.v2.brands.addBrand.mutate(input),
	catalogMutationSchemas,
);

export const updateBrandMutationOptions = resultMutationOptions(
	(input: addBrandType) => trpcClient.v2.brands.updateBrand.mutate(input),
	catalogMutationSchemas,
);

export const deleteBrandMutationOptions = resultMutationOptions(
	(input: { id: number }) => trpcClient.v2.brands.deleteBrand.mutate(input),
	catalogMutationSchemas,
);

export const addCategoryMutationOptions = resultMutationOptions(
	(input: addCategoryType) => trpcClient.v2.category.addCategory.mutate(input),
	catalogMutationSchemas,
);

export const updateCategoryMutationOptions = resultMutationOptions(
	(input: addCategoryType) =>
		trpcClient.v2.category.updateCategory.mutate(input),
	catalogMutationSchemas,
);

export const deleteCategoryMutationOptions = resultMutationOptions(
	(input: { id: number }) =>
		trpcClient.v2.category.deleteCategory.mutate(input),
	catalogMutationSchemas,
);

export const addCustomerMutationOptions = resultMutationOptions(
	(input: { phone: number; address?: string; addressZoneId?: number }) =>
		trpcClient.v2.customer.addUser.mutate(input),
	customerCreatedSchemas,
);

export const updateCustomerMutationOptions = resultMutationOptions(
	(input: { phone: number; address?: string }) =>
		trpcClient.v2.customer.updateCustomer.mutate(input),
	customerUpdatedSchemas,
);

export const deleteCustomerMutationOptions = resultMutationOptions(
	(input: { phone: number }) =>
		trpcClient.v2.customer.deleteCustomer.mutate(input),
	catalogMutationSchemas,
);

export const addImageMutationOptions = resultMutationOptions(
	(input: { productId: number; url: string }) =>
		trpcClient.v2.image.addImage.mutate(input),
	catalogMutationSchemas,
);

export const deleteImageMutationOptions = resultMutationOptions(
	(input: { id: number }) => trpcClient.v2.image.deleteImage.mutate(input),
	catalogMutationSchemas,
);

export const setPrimaryImageMutationOptions = resultMutationOptions(
	(input: { productId: number; imageId: number }) =>
		trpcClient.v2.image.setPrimaryImage.mutate(input),
	catalogMutationSchemas,
);

export const startProductExtractionMutationOptions = resultMutationOptions(
	(input: { query: string }) =>
		trpcClient.v2.aiProduct.startExtraction.mutate(input),
	aiExtractionStartSchemas,
);

export const scrapeProductMutationOptions = resultMutationOptions(
	(input: { sessionId: string }) =>
		trpcClient.v2.aiProduct.scrapeAndAnalyze.mutate(input),
	aiExtractionProgressSchemas,
);

export const translateProductMutationOptions = resultMutationOptions(
	(input: { sessionId: string }) =>
		trpcClient.v2.aiProduct.translateProduct.mutate(input),
	aiExtractionProgressSchemas,
);

export const finalizeProductMutationOptions = resultMutationOptions(
	(input: { sessionId: string }) =>
		trpcClient.v2.aiProduct.finalizeExtraction.mutate(input),
	aiExtractedProductSchemas,
);

export const regenerateProductImagesMutationOptions = resultMutationOptions(
	(input: { productId: number; query?: string }) =>
		trpcClient.v2.aiProduct.regenerateProductImages.mutate(input),
	aiRegeneratedImagesSchemas,
);
