import * as v from "valibot";
import { publicErrorSchema } from "./errors";

export const checkoutIdempotencyKeySchema = v.pipe(
	v.string(),
	v.minLength(16),
	v.maxLength(128),
	v.regex(/^checkout_[A-Za-z0-9_-]+$/),
);

const cartCorrectionSchema = v.strictObject({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	reason: v.picklist(["missing", "inactive", "quantity_changed"]),
	available: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

const stockItemSchema = v.strictObject({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	productName: v.string(),
	requested: v.pipe(v.number(), v.integer(), v.minValue(1)),
	available: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export const checkoutErrorSchema = v.variant("_tag", [
	publicErrorSchema("CartEmpty", {
		message: v.literal("Сагс хоосон байна."),
	}),
	publicErrorSchema("CartChanged", {
		message: v.literal("Сагсны мэдээлэл өөрчлөгдсөн байна."),
		corrections: v.array(cartCorrectionSchema),
	}),
	publicErrorSchema("InvalidCheckoutDetails", {
		message: v.literal("Захиалгын мэдээлэл дутуу эсвэл буруу байна."),
		fields: v.array(v.string()),
	}),
	publicErrorSchema("ProductUnavailable", {
		message: v.literal("Сонгосон бараа одоогоор захиалах боломжгүй байна."),
		productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		productName: v.optional(v.string()),
	}),
	publicErrorSchema("InsufficientStock", {
		message: v.literal("Зарим барааны үлдэгдэл хүрэлцэхгүй байна."),
		items: v.array(stockItemSchema),
	}),
	publicErrorSchema("DeliveryUnavailable", {
		message: v.literal("Хүргэлтийн мэдээллийг баталгаажуулж чадсангүй."),
	}),
	publicErrorSchema("CheckoutKeyConflict", {
		message: v.literal("Энэ оролдлогын мэдээлэл өмнөх хүсэлтээс өөр байна."),
	}),
	publicErrorSchema("CheckoutRecoveryRequired", {
		message: v.literal(
			"Захиалга үүссэн боловч үргэлжлүүлэх холбоосыг бэлтгэж чадсангүй.",
		),
		orderNumber: v.optional(v.string()),
	}),
]);

export const checkoutCreatedSchema = v.strictObject({
	paymentNumber: v.string(),
	orderNumber: v.string(),
	checkoutToken: v.string(),
	total: v.pipe(v.number(), v.integer(), v.minValue(0)),
	customerPhone: v.string(),
	accountNumber: v.string(),
	accountName: v.string(),
});

export type CheckoutError = v.InferOutput<typeof checkoutErrorSchema>;
export type CheckoutCreated = v.InferOutput<typeof checkoutCreatedSchema>;
