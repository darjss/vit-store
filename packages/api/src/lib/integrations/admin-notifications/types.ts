import * as v from "valibot";

const notificationProductSchema = v.object({
	imageUrl: v.optional(v.string()),
	name: v.string(),
	price: v.number(),
	quantity: v.number(),
});

export const detailedOrderNotificationInputSchema = v.object({
	address: v.string(),
	customerPhone: v.number(),
	notes: v.nullable(v.string()),
	orderNumber: v.string(),
	paymentNumber: v.string(),
	products: v.array(notificationProductSchema),
	provider: v.picklist(["qpay", "transfer", "cash"]),
	total: v.number(),
});

export type DetailedOrderNotificationInput = v.InferOutput<
	typeof detailedOrderNotificationInputSchema
>;

export const transferClaimedNotificationInputSchema = v.object({
	address: v.string(),
	customerPhone: v.number(),
	notes: v.nullable(v.string()),
	paymentNumber: v.string(),
	products: v.array(notificationProductSchema),
	total: v.number(),
});

export type TransferClaimedNotificationInput = v.InferOutput<
	typeof transferClaimedNotificationInputSchema
>;
