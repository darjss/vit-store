import * as v from "valibot";

export const deliveryProviderSchema = v.picklist([
	"messenger",
	"sms",
	"email",
	"qpay",
	"search",
	"upload",
]);

export type DeliveryProvider = v.InferOutput<typeof deliveryProviderSchema>;

export const deliveryFailureCodeSchema = v.picklist([
	"network_failure",
	"timeout",
	"rate_limited",
	"provider_unavailable",
	"provider_rejected",
	"invalid_recipient",
	"invalid_payload",
	"malformed_response",
	"duplicate",
]);

export type DeliveryFailureCode = v.InferOutput<
	typeof deliveryFailureCodeSchema
>;

const deliveryFailureFields = {
	provider: deliveryProviderSchema,
	code: deliveryFailureCodeSchema,
} as const;

/** Plain internal delivery outcomes safe for logs, storage, and RPC. */
export const deliveryFailureSchema = v.variant("_tag", [
	v.strictObject({
		_tag: v.literal("RetryableDeliveryFailure"),
		...deliveryFailureFields,
		retryable: v.literal(true),
	}),
	v.strictObject({
		_tag: v.literal("AmbiguousDelivery"),
		...deliveryFailureFields,
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("PermanentDeliveryFailure"),
		...deliveryFailureFields,
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("DuplicateInboundDelivery"),
		provider: v.literal("messenger"),
		code: v.literal("duplicate"),
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("InvalidDelivery"),
		...deliveryFailureFields,
		retryable: v.literal(false),
	}),
]);

export type DeliveryFailure = v.InferOutput<typeof deliveryFailureSchema>;

export const retryableDeliveryFailure = (
	provider: DeliveryProvider,
	code: DeliveryFailureCode,
) =>
	({
		_tag: "RetryableDeliveryFailure",
		provider,
		code,
		retryable: true,
	}) satisfies DeliveryFailure;

export const ambiguousDelivery = (
	provider: DeliveryProvider,
	code: DeliveryFailureCode,
) =>
	({
		_tag: "AmbiguousDelivery",
		provider,
		code,
		retryable: false,
	}) satisfies DeliveryFailure;

export const permanentDeliveryFailure = (
	provider: DeliveryProvider,
	code: DeliveryFailureCode,
) =>
	({
		_tag: "PermanentDeliveryFailure",
		provider,
		code,
		retryable: false,
	}) satisfies DeliveryFailure;

export const duplicateInboundDelivery = () =>
	({
		_tag: "DuplicateInboundDelivery",
		provider: "messenger",
		code: "duplicate",
		retryable: false,
	}) satisfies DeliveryFailure;

export const invalidDelivery = (
	provider: DeliveryProvider,
	code: Extract<
		DeliveryFailureCode,
		"invalid_payload" | "invalid_recipient" | "malformed_response"
	>,
) =>
	({
		_tag: "InvalidDelivery",
		provider,
		code,
		retryable: false,
	}) satisfies DeliveryFailure;
