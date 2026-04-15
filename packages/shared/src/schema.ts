import * as v from "valibot";
import { purchaseProvider, purchaseStatus } from "./constants";

export const orderSchema = v.object({
	phone: v.pipe(
		v.string(),
		v.transform(Number),
		v.pipe(v.number(), v.integer(), v.minValue(60000000), v.maxValue(99999999)),
	),
	address: v.pipe(v.string(), v.minLength(10)),
	total: v.number(),
	notes: v.optional(v.string()),
	items: v.array(
		v.object({
			productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
			quantity: v.pipe(v.number(), v.minValue(1)),
		}),
	),
});

export const imageSchema = v.object({
	url: v.pipe(v.string(), v.url()),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
});

const productSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	price: v.pipe(v.number(), v.integer(), v.minValue(20000)),
	name: v.optional(v.string()),
	imageUrl: v.optional(v.pipe(v.string(), v.url())),
	stock: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.finite())),
});

const purchaseProductSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantityOrdered: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	unitCost: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	name: v.optional(v.string()),
});

const receivePurchaseItemSchema = v.object({
	purchaseItemId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantityReceived: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

const aiPurchaseImageSchema = v.object({
	url: v.pipe(v.string(), v.url()),
});

const newPurchaseProductDraftSchema = v.object({
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	name_mn: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	description: v.optional(v.nullable(v.string())),
	brand: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	brandId: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
	),
	categoryId: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
	),
	amount: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	potency: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	images: v.optional(v.array(aiPurchaseImageSchema)),
	sourceCode: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
	rawText: v.optional(v.nullable(v.string())),
});

const matchedPurchaseProductSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
	imageUrl: v.optional(v.nullable(v.pipe(v.string(), v.url()))),
});

const matchedPurchaseLineSchema = v.object({
	sourceCode: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
	description: v.pipe(v.string(), v.minLength(1)),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	unitPrice: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	lineTotal: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
	),
	expirationDate: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(32)))),
	matchStatus: v.picklist(["matched", "ambiguous", "unmatched"]),
	productId: v.optional(
		v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
	),
	matchedProduct: v.optional(v.nullable(matchedPurchaseProductSchema)),
	candidateMatches: v.optional(v.array(matchedPurchaseProductSchema)),
	newProductDraft: v.optional(v.nullable(newPurchaseProductDraftSchema)),
	warnings: v.array(v.string()),
});

export const addProductSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
	description: v.pipe(v.string(), v.minLength(5)),
	dailyIntake: v.pipe(v.number(), v.integer(), v.minValue(1)),
	brandId: v.pipe(v.string(), v.transform(Number.parseInt), v.minValue(1)),
	categoryId: v.pipe(v.string(), v.transform(Number.parseInt), v.minValue(1)),
	amount: v.pipe(v.string(), v.minLength(3)),
	potency: v.pipe(v.string(), v.minLength(2)),
	status: v.picklist(["active", "draft", "out_of_stock"] as const),
	stock: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	price: v.pipe(v.number(), v.integer(), v.minValue(20000)),
	images: v.array(imageSchema),
	// Optional AI-extracted fields
	name_mn: v.optional(v.pipe(v.string(), v.maxLength(256))),
	ingredients: v.optional(v.array(v.string())),
	tags: v.optional(v.array(v.string())),
	seoTitle: v.optional(v.pipe(v.string(), v.maxLength(256))),
	seoDescription: v.optional(v.pipe(v.string(), v.maxLength(512))),
	weightGrams: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
	expirationDate: v.optional(
		v.union([
			v.literal(""),
			v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
			v.pipe(v.string(), v.regex(/^(0[1-9]|1[0-2])\/\d{2}$/)),
			v.pipe(v.string(), v.regex(/^(0[1-9]|1[0-2])\/\d{4}$/)),
		]),
	),
});

export const updateProductSchema = v.object({
	...addProductSchema.entries,
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

export const addOrderSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	customerPhone: v.pipe(
		v.string(),
		v.minLength(8),
		v.maxLength(8),
		v.regex(/^[6-9]\d{7}$/),
	),

	address: v.pipe(v.string(), v.minLength(10)),
	notes: v.optional(v.nullable(v.pipe(v.string(), v.minLength(3)))),
	status: v.picklist([
		"pending",
		"shipped",
		"delivered",
		"cancelled",
		"refunded",
	]),
	paymentStatus: v.picklist(["pending", "success", "failed"]),
	deliveryProvider: v.picklist(["tu-delivery", "self", "avidaa", "pick-up"]),
	isNewCustomer: v.boolean(),
	products: v.array(productSchema),
});

export const updateOrderSchema = v.object({
	...addOrderSchema.entries,
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

export const addPurchaseSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	provider: v.picklist(purchaseProvider),
	externalOrderNumber: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	trackingNumber: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
	shippingCost: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	notes: v.optional(v.nullable(v.string())),
	orderedAt: v.optional(v.nullable(v.date())),
	shippedAt: v.optional(v.nullable(v.date())),
	forwarderReceivedAt: v.optional(v.nullable(v.date())),
	receivedAt: v.optional(v.nullable(v.date())),
	cancelledAt: v.optional(v.nullable(v.date())),
	items: v.pipe(v.array(purchaseProductSchema), v.minLength(1)),
});

export const editPurchaseSchema = addPurchaseSchema;

export const receivePurchaseSchema = v.object({
	purchaseId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	receivedAt: v.date(),
	notes: v.optional(v.nullable(v.string())),
	items: v.pipe(v.array(receivePurchaseItemSchema), v.minLength(1)),
});

export const listPurchasesSchema = v.object({
	page: v.pipe(v.number(), v.integer(), v.minValue(1)),
	pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
	searchTerm: v.optional(v.string()),
	provider: v.optional(v.picklist(purchaseProvider)),
	status: v.optional(v.picklist(purchaseStatus)),
	sortField: v.optional(v.string()),
	sortDirection: v.picklist(["asc", "desc"]),
});

export const extractPurchaseFromImagesSchema = v.object({
	provider: v.picklist(purchaseProvider),
	images: v.pipe(v.array(aiPurchaseImageSchema), v.minLength(1)),
});

export const aiExtractedPurchaseSchema = v.object({
	header: v.object({
		provider: v.picklist(purchaseProvider),
		externalOrderNumber: v.optional(v.nullable(v.string())),
		orderedAt: v.optional(v.nullable(v.date())),
		trackingNumber: v.optional(v.nullable(v.string())),
		shippingCost: v.optional(
			v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
		),
		notes: v.optional(v.nullable(v.string())),
		subtotal: v.optional(
			v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
		),
		total: v.optional(
			v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
		),
	}),
	items: v.array(matchedPurchaseLineSchema),
	extractionStatus: v.picklist(["success", "partial", "failed"]),
	errors: v.array(v.string()),
	rawText: v.optional(v.nullable(v.string())),
});

export const saveExtractedPurchaseSchema = v.object({
	provider: v.picklist(purchaseProvider),
	externalOrderNumber: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	trackingNumber: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
	shippingCost: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	notes: v.optional(v.nullable(v.string())),
	orderedAt: v.optional(v.nullable(v.date())),
	shippedAt: v.optional(v.nullable(v.date())),
	forwarderReceivedAt: v.optional(v.nullable(v.date())),
	items: v.pipe(v.array(matchedPurchaseLineSchema), v.minLength(1)),
});

export const addBrandSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	logoUrl: v.pipe(v.string(), v.url()),
});

export const addCategorySchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
});

export const timeRangeSchema = v.picklist(["daily", "weekly", "monthly"]);
export const phoneSchema = v.pipe(
	v.string(),
	v.minLength(8, "Phone number must be 8 digits"),
	v.maxLength(8, "Phone number must be 8 digits"),
	v.regex(/^[6-9]\d{7}$/, "Phone number must start with 6-9"),
);

export const newOrderSchema = v.object({
	phoneNumber: v.pipe(
		v.string(),
		v.minLength(8),
		v.maxLength(8),
		v.regex(/^[6-9]\d{7}$/),
	),
	address: v.string(),
	notes: v.optional(v.string()),
	products: v.array(
		v.object({
			productId: v.number(),
			quantity: v.number(),
		}),
	),
});

export type newOrderType = v.InferOutput<typeof newOrderSchema>;
export type addBrandType = v.InferOutput<typeof addBrandSchema>;
export type addCategoryType = v.InferOutput<typeof addCategorySchema>;
export type addProductType = v.InferOutput<typeof addProductSchema>;
export type addImageType = addProductType["images"];
export type addOrderType = v.InferOutput<typeof addOrderSchema>;
export type addOrderProductType = v.InferOutput<typeof productSchema>;
export type imageType = v.InferOutput<typeof imageSchema>;
export type addPurchaseType = v.InferOutput<typeof addPurchaseSchema>;
export type editPurchaseType = v.InferOutput<typeof editPurchaseSchema>;
export type addPurchaseProductType = v.InferOutput<
	typeof purchaseProductSchema
>;
export type receivePurchaseType = v.InferOutput<typeof receivePurchaseSchema>;
export type receivePurchaseItemType = v.InferOutput<
	typeof receivePurchaseItemSchema
>;
export type listPurchasesType = v.InferOutput<typeof listPurchasesSchema>;
export type aiPurchaseImageType = v.InferOutput<typeof aiPurchaseImageSchema>;
export type newPurchaseProductDraftType = v.InferOutput<
	typeof newPurchaseProductDraftSchema
>;
export type matchedPurchaseLineType = v.InferOutput<
	typeof matchedPurchaseLineSchema
>;
export type extractPurchaseFromImagesType = v.InferOutput<
	typeof extractPurchaseFromImagesSchema
>;
export type aiExtractedPurchaseType = v.InferOutput<
	typeof aiExtractedPurchaseSchema
>;
export type saveExtractedPurchaseType = v.InferOutput<
	typeof saveExtractedPurchaseSchema
>;
export type orderType = v.InferOutput<typeof orderSchema>;
export type timeRangeType = v.InferOutput<typeof timeRangeSchema>;
