import * as v from "valibot";
import { paymentStatus, purchaseProvider, purchaseStatus } from "./constants";

export const orderSchema = v.object({
	address: v.pipe(v.string(), v.minLength(10, "Хаяг хамгийн багадаа 10 тэмдэгт байх ёстой")),
	items: v.array(
		v.object({
			productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
			quantity: v.pipe(v.number(), v.minValue(1)),
		}),
	),
	notes: v.optional(v.string()),
	phone: v.pipe(
		v.string(),
		v.transform(Number),
		v.pipe(v.number(), v.integer(), v.minValue(60_000_000), v.maxValue(99_999_999)),
	),
	total: v.number(),
});

export const imageSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	url: v.pipe(v.string(), v.url("Зөв холбоос оруулна уу")),
});

const productSchema = v.object({
	imageUrl: v.optional(v.pipe(v.string(), v.url())),
	name: v.optional(v.string()),
	price: v.pipe(v.number(), v.integer(), v.minValue(20_000)),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	stock: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.finite())),
});

const purchaseProductSchema = v.object({
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	name: v.optional(v.string()),
	productId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantityOrdered: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	unitCost: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

const receivePurchaseItemSchema = v.object({
	purchaseItemId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	quantityReceived: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

const aiPurchaseImageSchema = v.object({
	url: v.pipe(v.string(), v.url()),
});

const newPurchaseProductDraftSchema = v.object({
	amount: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	brand: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	brandId: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))),
	categoryId: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))),
	description: v.optional(v.nullable(v.string())),
	images: v.optional(v.array(aiPurchaseImageSchema)),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	name_mn: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	potency: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	rawText: v.optional(v.nullable(v.string())),
	sourceCode: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
});

const matchedPurchaseProductSchema = v.object({
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	imageUrl: v.optional(v.nullable(v.pipe(v.string(), v.url()))),
	name: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

const matchedPurchaseLineSchema = v.object({
	candidateMatches: v.optional(v.array(matchedPurchaseProductSchema)),
	description: v.pipe(v.string(), v.minLength(1)),
	expirationDate: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(32)))),
	lineTotal: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
	matchedProduct: v.optional(v.nullable(matchedPurchaseProductSchema)),
	matchStatus: v.picklist(["matched", "ambiguous", "unmatched"]),
	newProductDraft: v.optional(v.nullable(newPurchaseProductDraftSchema)),
	productId: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	sourceCode: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
	unitPrice: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	warnings: v.array(v.string()),
});

export const addProductSchema = v.object({
	amount: v.pipe(v.string(), v.minLength(3, "Хэмжээ хамгийн багадаа 3 тэмдэгт байх ёстой")),
	brandId: v.pipe(v.string(), v.transform(Number.parseInt), v.minValue(1, "Брэнд сонгоно уу")),
	categoryId: v.pipe(v.string(), v.transform(Number.parseInt), v.minValue(1, "Ангилал сонгоно уу")),
	dailyIntake: v.pipe(v.number(), v.integer(), v.minValue(1, "Өдрийн тунг оруулна уу")),
	description: v.pipe(v.string(), v.minLength(5, "Тайлбар хамгийн багадаа 5 тэмдэгт байх ёстой")),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	images: v.array(imageSchema),
	name: v.pipe(
		v.string(),
		v.minLength(1, "Нэр оруулна уу"),
		v.maxLength(100, "Нэр 100 тэмдэгтээс хэтрэхгүй байх ёстой"),
	),
	potency: v.pipe(v.string(), v.minLength(2, "Агууламж хамгийн багадаа 2 тэмдэгт байх ёстой")),
	price: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(20_000, "Үнэ хамгийн багадаа 20,000₮ байх ёстой"),
	),
	status: v.picklist(["active", "draft", "out_of_stock"] as const),
	stock: v.pipe(v.number(), v.integer(), v.minValue(1, "Нөөц хамгийн багадаа 1 байх ёстой")),
	// Optional AI-extracted fields
	expirationDate: v.optional(
		v.union([
			v.literal(""),
			v.pipe(v.string(), v.regex(/^\d{4}-(0[1-9]|1[0-2])$/)),
			v.pipe(v.string(), v.regex(/^(0[1-9]|1[0-2])\/\d{2}$/)),
			v.pipe(v.string(), v.regex(/^(0[1-9]|1[0-2])\/\d{4}$/)),
		]),
	),
	ingredients: v.optional(v.array(v.string())),
	name_mn: v.optional(v.pipe(v.string(), v.maxLength(256))),
	seoDescription: v.optional(v.pipe(v.string(), v.maxLength(512))),
	seoTitle: v.optional(v.pipe(v.string(), v.maxLength(256))),
	tags: v.optional(v.array(v.string())),
	weightGrams: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

export const updateProductSchema = v.object({
	...addProductSchema.entries,
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

export const addOrderSchema = v.object({
	address: v.pipe(v.string(), v.minLength(10, "Хаяг хамгийн багадаа 10 тэмдэгт байх ёстой")),
	addressZoneId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),

	customerPhone: v.pipe(
		v.string(),
		v.minLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
		v.maxLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
		v.regex(/^[6-9]\d{7}$/, "Утасны дугаар 6-9-өөр эхлэх ёстой"),
	),
	deliveryProvider: v.picklist(["tu-delivery", "self", "avidaa", "pick-up"]),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	isNewCustomer: v.boolean(),
	notes: v.optional(v.nullable(v.string())),
	paymentStatus: v.picklist(paymentStatus),
	products: v.array(productSchema),
	status: v.picklist(["created", "pending", "shipped", "delivered", "cancelled", "refunded"]),
});

export const updateOrderSchema = v.object({
	...addOrderSchema.entries,
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
});

/**
 * Lightweight header-only patch for inline field edits on the order detail
 * page (notes, address, customerPhone, deliveryProvider, status). Touches
 * ONLY order header columns — it does NOT rewrite order details, sales, or
 * stock, so editing "Тэмдэглэл" on a paid order no longer deletes+recreates
 * every order-detail row. Payment-status changes must still go through
 * `updateOrder` because they can trigger stock/sales transitions.
 */
export const patchOrderHeaderSchema = v.object({
	address: v.optional(
		v.pipe(v.string(), v.minLength(10, "Хаяг хамгийн багадаа 10 тэмдэгт байх ёстой")),
	),
	addressZoneId: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()))),
	customerPhone: v.optional(
		v.pipe(
			v.string(),
			v.minLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
			v.maxLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
			v.regex(/^[6-9]\d{7}$/, "Утасны дугаар 6-9-өөр эхлэх ёстой"),
		),
	),
	deliveryProvider: v.optional(v.picklist(["tu-delivery", "self", "avidaa", "pick-up"])),
	id: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	notes: v.optional(v.nullable(v.string())),
	status: v.optional(
		v.picklist(["created", "pending", "shipped", "delivered", "cancelled", "refunded"]),
	),
});

export const addPurchaseSchema = v.object({
	cancelledAt: v.optional(v.nullable(v.date())),
	externalOrderNumber: v.pipe(
		v.string(),
		v.minLength(1, "Захиалгын дугаар оруулна уу"),
		v.maxLength(128, "Захиалгын дугаар 128 тэмдэгтээс хэтрэхгүй байх ёстой"),
	),
	forwarderReceivedAt: v.optional(v.nullable(v.date())),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	items: v.pipe(
		v.array(purchaseProductSchema),
		v.minLength(1, "Хамгийн багадаа нэг бүтээгдэхүүн нэмнэ үү"),
	),
	notes: v.optional(v.nullable(v.string())),
	orderedAt: v.optional(v.nullable(v.date())),
	provider: v.picklist(purchaseProvider),
	receivedAt: v.optional(v.nullable(v.date())),
	shippedAt: v.optional(v.nullable(v.date())),
	shippingCost: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	trackingNumber: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
});

export const editPurchaseSchema = addPurchaseSchema;

export const receivePurchaseSchema = v.object({
	items: v.pipe(v.array(receivePurchaseItemSchema), v.minLength(1)),
	notes: v.optional(v.nullable(v.string())),
	purchaseId: v.pipe(v.number(), v.integer(), v.minValue(1), v.finite()),
	receivedAt: v.date(),
});

export const listPurchasesSchema = v.object({
	page: v.pipe(v.number(), v.integer(), v.minValue(1)),
	pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
	provider: v.optional(v.picklist(purchaseProvider)),
	searchTerm: v.optional(v.string()),
	sortDirection: v.picklist(["asc", "desc"]),
	sortField: v.optional(v.string()),
	status: v.optional(v.picklist(purchaseStatus)),
});

export const extractPurchaseFromImagesSchema = v.object({
	images: v.pipe(v.array(aiPurchaseImageSchema), v.minLength(1)),
	provider: v.picklist(purchaseProvider),
});

export const aiExtractedPurchaseSchema = v.object({
	errors: v.array(v.string()),
	extractionStatus: v.picklist(["success", "partial", "failed"]),
	header: v.object({
		externalOrderNumber: v.optional(v.nullable(v.string())),
		notes: v.optional(v.nullable(v.string())),
		orderedAt: v.optional(v.nullable(v.date())),
		provider: v.picklist(purchaseProvider),
		shippingCost: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
		subtotal: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
		total: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
		trackingNumber: v.optional(v.nullable(v.string())),
	}),
	items: v.array(matchedPurchaseLineSchema),
	rawText: v.optional(v.nullable(v.string())),
});

export const saveExtractedPurchaseSchema = v.object({
	externalOrderNumber: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
	forwarderReceivedAt: v.optional(v.nullable(v.date())),
	items: v.pipe(v.array(matchedPurchaseLineSchema), v.minLength(1)),
	notes: v.optional(v.nullable(v.string())),
	orderedAt: v.optional(v.nullable(v.date())),
	provider: v.picklist(purchaseProvider),
	shippedAt: v.optional(v.nullable(v.date())),
	shippingCost: v.pipe(v.number(), v.integer(), v.minValue(0), v.finite()),
	trackingNumber: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(128)))),
});

export const addBrandSchema = v.object({
	bannerImage: v.optional(v.nullable(v.union([v.literal(""), v.pipe(v.string(), v.url())]))),
	description: v.optional(v.nullable(v.string())),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	logoUrl: v.union([v.literal(""), v.pipe(v.string(), v.url("Зөв холбоос оруулна уу"))]),
	name: v.pipe(
		v.string(),
		v.minLength(1, "Нэр оруулна уу"),
		v.maxLength(256, "Нэр 256 тэмдэгтээс хэтрэхгүй байх ёстой"),
	),
	seoDescription: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(512)))),
	seoTitle: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	slug: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
});

export const addCategorySchema = v.object({
	bannerImage: v.optional(v.nullable(v.union([v.literal(""), v.pipe(v.string(), v.url())]))),
	description: v.optional(v.nullable(v.string())),
	id: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	name: v.pipe(
		v.string(),
		v.minLength(1, "Нэр оруулна уу"),
		v.maxLength(256, "Нэр 256 тэмдэгтээс хэтрэхгүй байх ёстой"),
	),
	seoDescription: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(512)))),
	seoTitle: v.optional(v.nullable(v.pipe(v.string(), v.maxLength(256)))),
	slug: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(256))),
});

export const timeRangeSchema = v.picklist(["daily", "weekly", "monthly"]);
export const phoneSchema = v.pipe(
	v.string(),
	v.minLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
	v.maxLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
	v.regex(/^[6-9]\d{7}$/, "Утасны дугаар 6-9-өөр эхлэх ёстой"),
);

export const newOrderSchema = v.object({
	address: v.string(),
	addressZoneId: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.finite())),
	notes: v.optional(v.string()),
	phoneNumber: v.pipe(
		v.string(),
		v.minLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
		v.maxLength(8, "Утасны дугаар 8 оронтой байх ёстой"),
		v.regex(/^[6-9]\d{7}$/, "Утасны дугаар 6-9-өөр эхлэх ёстой"),
	),
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
export type addPurchaseProductType = v.InferOutput<typeof purchaseProductSchema>;
export type receivePurchaseType = v.InferOutput<typeof receivePurchaseSchema>;
export type receivePurchaseItemType = v.InferOutput<typeof receivePurchaseItemSchema>;
export type listPurchasesType = v.InferOutput<typeof listPurchasesSchema>;
export type aiPurchaseImageType = v.InferOutput<typeof aiPurchaseImageSchema>;
export type newPurchaseProductDraftType = v.InferOutput<typeof newPurchaseProductDraftSchema>;
export type matchedPurchaseLineType = v.InferOutput<typeof matchedPurchaseLineSchema>;
export type extractPurchaseFromImagesType = v.InferOutput<typeof extractPurchaseFromImagesSchema>;
export type aiExtractedPurchaseType = v.InferOutput<typeof aiExtractedPurchaseSchema>;
export type saveExtractedPurchaseType = v.InferOutput<typeof saveExtractedPurchaseSchema>;
export type orderType = v.InferOutput<typeof orderSchema>;
export type timeRangeType = v.InferOutput<typeof timeRangeSchema>;
