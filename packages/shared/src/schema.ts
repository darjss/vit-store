import * as v from "valibot";

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
});

const purchaseProductSchema = v.object({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	unitCost: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	name: v.optional(v.string()),
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
	products: v.pipe(v.array(purchaseProductSchema), v.minLength(1)),
});

export const editPurchaseSchema = addPurchaseSchema;

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

// Export types
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
export type orderType = v.InferOutput<typeof orderSchema>;
export type timeRangeType = v.InferOutput<typeof timeRangeSchema>;
