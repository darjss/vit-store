import * as v from "valibot";
import type { UserSelectType } from "~/db/schema";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";

const jsonDateSchema = v.pipe(
	v.union([v.string(), v.date()]),
	v.transform((value) => (value instanceof Date ? value : new Date(value))),
);

const checkoutScopeWireSchema = v.object({
	orderId: v.number(),
	orderNumber: v.string(),
	paymentNumber: v.string(),
});

export const sessionCustomerWireSchema: v.GenericSchema<CustomerSessionClaims> = v.object({
	address: v.nullable(v.string()),
	addressZoneId: v.nullable(v.number()),
	checkout: v.optional(checkoutScopeWireSchema),
	createdAt: jsonDateSchema,
	deletedAt: v.nullable(jsonDateSchema),
	facebook_username: v.nullable(v.string()),
	id: v.number(),
	instagram_username: v.nullable(v.string()),
	phone: v.number(),
	trust: v.optional(v.picklist(["checkout_guest", "phone_verified"])),
	updatedAt: v.nullable(jsonDateSchema),
});

export const sessionUserWireSchema: v.GenericSchema<UserSelectType> = v.object({
	createdAt: jsonDateSchema,
	deletedAt: v.nullable(jsonDateSchema),
	googleId: v.nullable(v.string()),
	id: v.number(),
	isApproved: v.boolean(),
	updatedAt: v.nullable(jsonDateSchema),
	username: v.string(),
});
