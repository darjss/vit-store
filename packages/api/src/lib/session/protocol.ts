import * as v from "valibot";

export type CheckoutScope = {
	orderId: number;
	orderNumber: string;
	paymentNumber: string;
};

export type CheckoutAccessTokenRecord = CheckoutScope & {
	phone: number;
	tokenHash: string;
};

export const checkoutScopeSchema = v.strictObject({
	orderId: v.number(),
	orderNumber: v.string(),
	paymentNumber: v.string(),
});

export const checkoutAccessTokenRecordSchema = v.strictObject({
	...checkoutScopeSchema.entries,
	phone: v.number(),
	tokenHash: v.pipe(v.string(), v.minLength(1)),
}) satisfies v.GenericSchema<unknown, CheckoutAccessTokenRecord>;

export const customerSessionClaimsSchema = v.object({
	phone: v.number(),
	trust: v.optional(v.picklist(["checkout_guest", "phone_verified"])),
	checkout: v.optional(checkoutScopeSchema),
});
