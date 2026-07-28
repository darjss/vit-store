import * as v from "valibot";
import { publicErrorSchema } from "./errors";

const retryAfterSecondsSchema = v.pipe(v.number(), v.integer(), v.minValue(1));

export const otpSendRateLimitedSchema = publicErrorSchema(
	"OtpSendRateLimited",
	{ retryAfterSeconds: retryAfterSecondsSchema },
);
export const otpAttemptRateLimitedSchema = publicErrorSchema(
	"OtpAttemptRateLimited",
	{ retryAfterSeconds: retryAfterSecondsSchema },
);
export const otpInvalidOrExpiredSchema = publicErrorSchema(
	"OtpInvalidOrExpired",
	{},
);
export const otpDeliveryUnavailableSchema = publicErrorSchema(
	"OtpDeliveryUnavailable",
	{ retryable: v.boolean() },
);
export const phoneVerificationRequiredSchema = publicErrorSchema(
	"PhoneVerificationRequired",
	{},
);
export const sessionExpiredSchema = publicErrorSchema("SessionExpired", {});

export const authErrorSchema = v.variant("_tag", [
	otpSendRateLimitedSchema,
	otpAttemptRateLimitedSchema,
	otpInvalidOrExpiredSchema,
	otpDeliveryUnavailableSchema,
	phoneVerificationRequiredSchema,
	sessionExpiredSchema,
]);

export const sendOtpErrorSchema = v.variant("_tag", [
	otpSendRateLimitedSchema,
	otpDeliveryUnavailableSchema,
]);

export const loginErrorSchema = v.variant("_tag", [
	otpAttemptRateLimitedSchema,
	otpInvalidOrExpiredSchema,
]);

const sessionTimestampSchema = v.union([
	v.date(),
	v.pipe(v.string(), v.isoTimestamp()),
]);

export const customerSessionSchema = v.strictObject({
	id: v.pipe(v.number(), v.integer(), v.minValue(1)),
	phone: v.pipe(v.number(), v.integer()),
	address: v.nullable(v.string()),
	addressZoneId: v.nullable(v.pipe(v.number(), v.integer())),
	facebook_username: v.nullable(v.string()),
	instagram_username: v.nullable(v.string()),
	createdAt: sessionTimestampSchema,
	updatedAt: v.nullable(sessionTimestampSchema),
	deletedAt: v.nullable(sessionTimestampSchema),
	trust: v.optional(v.picklist(["checkout_guest", "phone_verified"])),
	checkout: v.optional(
		v.strictObject({
			orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			orderNumber: v.string(),
			paymentNumber: v.string(),
		}),
	),
});

export const sendOtpSuccessSchema = v.strictObject({
	success: v.literal(true),
	message: v.string(),
});

export const loginSuccessSchema = v.strictObject({
	success: v.literal(true),
	user: customerSessionSchema,
});

export const sendOtpResultSchemas = {
	value: sendOtpSuccessSchema,
	error: sendOtpErrorSchema,
};

export const loginResultSchemas = {
	value: loginSuccessSchema,
	error: loginErrorSchema,
};

export const sessionResultSchemas = {
	value: customerSessionSchema,
	error: sessionExpiredSchema,
};

export type AuthError = v.InferOutput<typeof authErrorSchema>;
export type SendOtpError = v.InferOutput<typeof sendOtpErrorSchema>;
export type LoginError = v.InferOutput<typeof loginErrorSchema>;
export type SessionError = v.InferOutput<typeof sessionExpiredSchema>;
export type CustomerSession = v.InferOutput<typeof customerSessionSchema>;
