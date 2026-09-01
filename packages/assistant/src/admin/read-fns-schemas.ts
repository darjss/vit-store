import {
	addBrandSchema,
	addCategorySchema,
	addOrderSchema,
	addProductSchema,
	addPurchaseSchema,
	extractPurchaseFromImagesSchema,
	listPurchasesSchema,
	patchOrderHeaderSchema,
	receivePurchaseSchema,
	saveExtractedPurchaseSchema,
	timeRangeSchema,
	updateOrderSchema,
	updateProductSchema,
} from "@vit/shared";
import {
	editableProductFields,
	orderStatus,
	paymentProvider,
	paymentStatus,
	purchaseProvider,
	status,
} from "@vit/shared/constants";
import * as v from "valibot";
import { purchaseInvoiceExtractionSchema } from "./purchase-invoice-schema";

export const idInputSchema = v.object({ id: v.number() });
export const positiveIdInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
export const timeRangeInputSchema = v.object({ timeRange: timeRangeSchema });
export const searchTermInputSchema = v.object({ searchTerm: v.string() });
export const queryInputSchema = v.object({ query: v.string() });
export const paymentNumberInputSchema = v.object({ paymentNumber: v.string() });

export const orderCountInputSchema = timeRangeInputSchema;

export const getPaginatedOrdersInputSchema = v.object({
	createdAfter: v.optional(v.date()),
	date: v.optional(v.string()),
	includeAllStatuses: v.optional(v.boolean()),
	orderStatus: v.optional(v.picklist(orderStatus)),
	orderStatuses: v.optional(v.array(v.picklist(orderStatus))),
	page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
	pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 20),
	paymentStatus: v.optional(v.picklist(paymentStatus)),
	searchTerm: v.optional(v.string()),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	sortField: v.optional(v.string()),
});

export const getRecentOrdersByProductIdInputSchema = v.object({ productId: v.number() });

export const searchOrderQuickInputSchema = v.object({
	limit: v.optional(v.number(), 5),
	query: v.pipe(v.string(), v.minLength(1)),
});

export const shipOrderInputSchema = v.object({
	addressZoneId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	orderId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

export const updateOrderStatusInputSchema = v.object({
	id: v.number(),
	status: v.picklist(["pending", "shipped", "delivered", "cancelled", "refunded"]),
});

export const getPaginatedProductsInputSchema = v.object({
	brandId: v.optional(v.number()),
	categoryId: v.optional(v.number()),
	page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
	pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 20),
	searchTerm: v.optional(v.string()),
	sortDirection: v.optional(v.picklist(["asc", "desc"])),
	sortField: v.optional(v.string()),
	status: v.optional(v.picklist(status)),
});

export const searchProductsInstantInputSchema = v.object({
	brandId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	categoryId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
	limit: v.optional(v.number(), 10),
	query: v.pipe(v.string(), v.minLength(1)),
	status: v.optional(v.picklist(status)),
});

export const setProductStockInputSchema = v.object({
	id: v.number(),
	newStock: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const updateProductFieldInputSchema = v.object({
	field: v.picklist(editableProductFields),
	id: v.number(),
	numberValue: v.optional(v.number()),
	stringValue: v.optional(v.string()),
});

export const updateStockInputSchema = v.object({
	numberToUpdate: v.number(),
	productId: v.number(),
	type: v.picklist(["add", "minus"]),
});

export const addUserInputSchema = v.object({
	address: v.optional(v.string()),
	addressZoneId: v.optional(v.number()),
	phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
});

export const phoneInputSchema = v.object({
	phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
});

export const updateCustomerInputSchema = v.object({
	address: v.optional(v.string()),
	phone: v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
});

export const createPaymentInputSchema = v.object({
	amount: v.pipe(v.number(), v.integer(), v.minValue(0)),
	orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	provider: v.picklist(paymentProvider),
	status: v.picklist(paymentStatus),
});

export const topProductsInputSchema = v.object({
	productCount: v.number(),
	timeRange: timeRangeSchema,
});

export const topSearchesInputSchema = v.object({
	limit: v.optional(v.number(), 20),
	timeRange: timeRangeSchema,
});

export const mostViewedProductsInputSchema = v.object({
	limit: v.optional(v.number(), 20),
	timeRange: timeRangeSchema,
});

export const productBehaviorInputSchema = v.object({
	productId: v.number(),
	timeRange: timeRangeSchema,
});

export const getAverageCostOfProductInputSchema = v.object({
	createdAt: v.date(),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const markPurchaseForwarderReceivedInputSchema = v.object({
	forwarderReceivedAt: v.date(),
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const markPurchaseShippedInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	shippedAt: v.date(),
});

export const updatePurchaseInputSchema = v.object({
	data: addPurchaseSchema,
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const productImageUrlInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	url: v.pipe(v.string(), v.url()),
});

export const productImageIdInputSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const setPrimaryProductImageInputSchema = v.object({
	imageId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const productImagesByProductIdInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const addProductImageInputSchema = v.object({
	isPrimary: v.boolean(),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	url: v.pipe(v.string(), v.url()),
});

export const updateProductImagesInputSchema = v.object({
	newImages: v.array(
		v.object({
			url: v.pipe(v.string(), v.url()),
		}),
	),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const uploadImagesFromUrlInputSchema = v.object({
	images: v.array(addProductImageInputSchema),
});

export const batchCreateProductsInputSchema = v.object({
	items: v.array(
		v.object({
			amazonUrl: v.pipe(v.string(), v.minLength(1)),
			price: v.pipe(v.number(), v.integer()),
			stock: v.pipe(v.number(), v.integer()),
		}),
	),
});

export const extractProductQueryInputSchema = v.object({
	query: v.pipe(v.string(), v.minLength(3)),
});

export const sessionIdInputSchema = v.object({
	sessionId: v.pipe(v.string(), v.minLength(1)),
});

export const regenerateProductImagesInputSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	query: v.optional(v.pipe(v.string(), v.minLength(3))),
});

export const matchExtractedInvoiceInputSchema = v.object({
	extraction: purchaseInvoiceExtractionSchema,
	provider: v.picklist(purchaseProvider),
});

export {
	addBrandSchema,
	addCategorySchema,
	addOrderSchema,
	addProductSchema,
	addPurchaseSchema,
	extractPurchaseFromImagesSchema,
	listPurchasesSchema,
	patchOrderHeaderSchema,
	receivePurchaseSchema,
	saveExtractedPurchaseSchema,
	updateOrderSchema,
	updateProductSchema,
};
