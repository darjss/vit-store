import * as v from "valibot";
import { publicErrorSchema } from "./errors";

export const invalidRestockContactSchema = publicErrorSchema("InvalidContact", {
	channel: v.picklist(["sms", "email"]),
});
export const restockContactNotVerifiedSchema = publicErrorSchema(
	"ContactNotVerified",
	{},
);
export const subscriptionLimitReachedSchema = publicErrorSchema(
	"SubscriptionLimitReached",
	{},
);
export const restockRateLimitedSchema = publicErrorSchema(
	"RestockRateLimited",
	{
		retryAfterSeconds: v.pipe(v.number(), v.integer(), v.minValue(1)),
	},
);
export const restockProductNotFoundSchema = publicErrorSchema(
	"ProductNotFound",
	{},
);
export const productAlreadyInStockSchema = publicErrorSchema(
	"ProductAlreadyInStock",
	{},
);

export const restockErrorSchema = v.variant("_tag", [
	invalidRestockContactSchema,
	restockContactNotVerifiedSchema,
	subscriptionLimitReachedSchema,
	restockRateLimitedSchema,
	restockProductNotFoundSchema,
	productAlreadyInStockSchema,
]);

export const restockSubscriptionSchema = v.strictObject({
	success: v.literal(true),
	message: v.string(),
	alreadySubscribed: v.boolean(),
	results: v.array(
		v.strictObject({
			channel: v.picklist(["sms", "email"]),
			alreadySubscribed: v.boolean(),
		}),
	),
});

export const restockSubscriptionResultSchemas = {
	value: restockSubscriptionSchema,
	error: restockErrorSchema,
};

export type RestockError = v.InferOutput<typeof restockErrorSchema>;
export type RestockSubscriptionResult = v.InferOutput<
	typeof restockSubscriptionSchema
>;
