import * as v from "valibot";

export const adminMutationSuccessSchema = v.strictObject({
	message: v.string(),
});

export const adminCreatedSuccessSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	message: v.string(),
});

export const adminBooleanSuccessSchema = v.strictObject({
	success: v.literal(true),
});

export const adminUserSchema = v.strictObject({
	id: v.number(),
	username: v.string(),
	googleId: v.nullable(v.string()),
	isApproved: v.boolean(),
	createdAt: v.date(),
	updatedAt: v.nullable(v.date()),
});

export const adminCustomerCreatedSchema = v.array(
	v.strictObject({ phone: v.number() }),
);
export const adminCustomerUpdatedSchema = v.strictObject({ phone: v.number() });

export const adminCustomerSchema = v.strictObject({
	id: v.number(),
	phone: v.number(),
	address: v.nullable(v.string()),
	addressZoneId: v.nullable(v.number()),
	facebook_username: v.nullable(v.string()),
	instagram_username: v.nullable(v.string()),
	createdAt: v.date(),
	updatedAt: v.nullable(v.date()),
	deletedAt: v.nullable(v.date()),
});

export const adminShipOrderSuccessSchema = v.strictObject({
	orderId: v.number(),
	orderNumber: v.string(),
	documentNo: v.string(),
	deliveryOrderId: v.union([v.string(), v.number()]),
});

export const adminBatchSuccessSchema = v.strictObject({
	total: v.pipe(v.number(), v.integer(), v.minValue(0)),
	succeeded: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

export type AdminMutationSuccess = v.InferOutput<
	typeof adminMutationSuccessSchema
>;
export type AdminCreatedSuccess = v.InferOutput<
	typeof adminCreatedSuccessSchema
>;
export type AdminBooleanSuccess = v.InferOutput<
	typeof adminBooleanSuccessSchema
>;
export type AdminUser = v.InferOutput<typeof adminUserSchema>;
export type AdminCustomer = v.InferOutput<typeof adminCustomerSchema>;
export type AdminShipOrderSuccess = v.InferOutput<
	typeof adminShipOrderSuccessSchema
>;
export type AdminBatchSuccess = v.InferOutput<typeof adminBatchSuccessSchema>;
