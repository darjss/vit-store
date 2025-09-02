import { z } from "zod";
import {
	deliveryProvider,
	orderStatus,
	paymentStatus,
	status,
} from "../constants";

export const orderSchema = z.object({
	phone: z.coerce
		.number()
		.int()
		.min(60000000, { message: "Number must be at least 60000000" })
		.max(99999999, { message: "Number must be at most 99999999" }),
	address: z.string().min(10, {
		message: "Address is too short",
	}),
	total: z.number(),
	notes: z.string().optional(),
	items: z.array(
		z.object({
			productId: z.number().int().positive().finite(),
			quantity: z.number().min(1, {
				message: "At least one product must be selected",
			}),
		}),
	),
});

export const imageSchema = z.object({
	url: z.url(),
	id: z.number().int().positive().finite().optional(),
});

const productSchema = z.object({
	productId: z.number().int().positive().finite(),
	quantity: z.number().int().positive().finite(),
	price: z.number().int().min(20000),
	name: z.string().optional(),
	imageUrl: z.string().url().optional(),
});

const purchaseProductSchema = z.object({
	productId: z.number().int().positive().finite(),
	quantity: z.number().int().positive().finite(),
	unitCost: z.number().int().positive().finite(),
	name: z.string().optional(),
});

export const addProductSchema = z.object({
	id: z.number().int().positive().finite().optional(),
	name: z
		.string()
		.min(1, {
			message: "Product name is too short",
		})
		.max(100),
	description: z.string().min(5, {
		message: "Product description is too short",
	}),
	dailyIntake: z.number().int().positive().finite(),
	brandId: z.coerce.number().int().positive().finite(),
	categoryId: z.coerce.number().int().positive().finite(),
	amount: z.string().min(3, {
		message: "Product amount is too short",
	}),
	potency: z.string().min(2, {
		message: "Product potency is too short",
	}),
	status: z.enum(status),
	stock: z.number().int().positive().finite(),
	price: z.number().int().min(20000),
	images: z.array(imageSchema).nonempty(),
});

export const updateProductSchema = addProductSchema.extend({
	id: z.number().int().positive().finite(),
});

export const addOrderSchema = z.object({
	id: z.number().int().positive().finite().optional(),
	customerPhone: z.coerce
		.number()
		.int()
		.min(60000000, { message: "Number must be at least 60000000" })
		.max(99999999, { message: "Number must be at most 99999999" }),
	address: z.string().min(10, {
		message: "Address is too short",
	}),
	notes: z
		.string()
		.min(3, {
			message: "Notes is too short",
		})
		.optional()
		.nullable(),
	status: z.enum(orderStatus),
	paymentStatus: z.enum(paymentStatus),
	deliveryProvider: z.enum(deliveryProvider),
	isNewCustomer: z.boolean(),
	products: z.array(productSchema),
});

export const updateOrderSchema = addOrderSchema.extend({
	id: z.number().int().positive().finite(),
});

export const addPurchaseSchema = z.object({
	id: z.number().int().positive().finite().optional(),
	products: z.array(purchaseProductSchema).min(1, {
		message: "At least one product must be selected",
	}),
});

export const editPurchaseSchema = addPurchaseSchema;

export const addBrandSchema = z.object({
	id: z.number().int().positive().finite().optional(),
	name: z
		.string()
		.min(1, {
			message: "Brand name is too short",
		})
		.max(256),
	imageUrl: z.url()
});

export const addCategorySchema = z.object({
	id: z.number().int().positive().finite().optional(),
	name: z
		.string()
		.min(1, {
			message: "Category name is too short",
		})
		.max(256),
});

export type addBrandType = z.infer<typeof addBrandSchema>;
export type addCategoryType = z.infer<typeof addCategorySchema>;

export type addProductType = z.infer<typeof addProductSchema>;
export type addImageType = addProductType["images"];
export type addOrderType = z.infer<typeof addOrderSchema>;
export type addOrderProductType = z.infer<typeof productSchema>;
export type imageType = z.infer<typeof imageSchema>;
export type addPurchaseType = z.infer<typeof addPurchaseSchema>;
export type editPurchaseType = z.infer<typeof editPurchaseSchema>;
export type addPurchaseProductType = z.infer<typeof purchaseProductSchema>;

export type orderType = z.infer<typeof orderSchema>;
export const timeRangeSchema = z.enum(["daily", "weekly", "monthly"]);
export type timeRangeType = z.infer<typeof timeRangeSchema>;
