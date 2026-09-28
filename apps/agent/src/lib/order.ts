import { TRPCClientError } from "@trpc/client";
import type {
	AiOperationError,
	AssistantCheckoutError,
	CheckoutOrderPayload,
	CreatedOrder,
	DeliveryZoneInput,
} from "@vit/assistant";
import {
	checkoutCreatedSchema,
	checkoutErrorSchema,
	deserializeResultOrThrow,
	type CheckoutError,
} from "@vit/shared";
import { Result, ResultDeserializationError } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

const ORDER_FETCH_TIMEOUT_MS = 20_000;

const deliveryZonesWireSchema = v.array(
	v.strictObject({ Id: v.number(), zoneName: v.string() }),
);

type OrderCreationFailure = Extract<
	AssistantCheckoutError,
	{ _tag: "OrderCreationFailed" }
>;

type InternalOrderFailure =
	| { _tag: "RetryableOrderFailure" }
	| { _tag: "AmbiguousOrderFailure" }
	| { _tag: "PermanentOrderFailure" };

const classifyOrderFailure = (
	error: unknown,
): InternalOrderFailure | undefined => {
	if (error instanceof TRPCClientError) {
		const code = error.data?.code;
		if (code === "TOO_MANY_REQUESTS") {
			return { _tag: "RetryableOrderFailure" };
		}
		if (
			code === "BAD_REQUEST" ||
			code === "UNPROCESSABLE_CONTENT" ||
			code === "FORBIDDEN" ||
			code === "UNAUTHORIZED"
		) {
			return { _tag: "PermanentOrderFailure" };
		}
		return { _tag: "AmbiguousOrderFailure" };
	}
	if (
		error instanceof TypeError ||
		ResultDeserializationError.is(error) ||
		(error instanceof DOMException && error.name === "TimeoutError")
	) {
		return { _tag: "AmbiguousOrderFailure" };
	}
	return undefined;
};

const publicOrderFailure = (
	failure: InternalOrderFailure,
): OrderCreationFailure =>
	match(
		failure,
		"_tag",
	)<OrderCreationFailure>({
		RetryableOrderFailure: () => ({
			_tag: "OrderCreationFailed",
			retryable: true,
			recovery: { _tag: "Retry" },
		}),
		AmbiguousOrderFailure: () => ({
			_tag: "OrderCreationFailed",
			retryable: true,
			recovery: { _tag: "Retry" },
		}),
		PermanentOrderFailure: () => ({
			_tag: "OrderCreationFailed",
			retryable: false,
			recovery: { _tag: "ContactSupport" },
		}),
	});

const checkoutFailure = (error: CheckoutError): OrderCreationFailure =>
	match(
		error,
		"_tag",
	)<OrderCreationFailure>({
		CartEmpty: () => publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		CartChanged: () => publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		InvalidCheckoutDetails: () =>
			publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		ProductUnavailable: () =>
			publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		InsufficientStock: () =>
			publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		DeliveryUnavailable: () =>
			publicOrderFailure({ _tag: "RetryableOrderFailure" }),
		CheckoutKeyConflict: () =>
			publicOrderFailure({ _tag: "PermanentOrderFailure" }),
		CheckoutRecoveryRequired: () =>
			publicOrderFailure({ _tag: "RetryableOrderFailure" }),
	});

type AddOrderMutation = (
	payload: CheckoutOrderPayload,
	signal: AbortSignal,
) => Promise<unknown>;

export const createOrderWithMutation = async (
	payload: CheckoutOrderPayload,
	mutate: AddOrderMutation,
	outerSignal?: AbortSignal,
) => {
	let data: unknown;
	try {
		data = await mutate(
			payload,
			withTimeout(outerSignal, ORDER_FETCH_TIMEOUT_MS),
		);
		const result = deserializeResultOrThrow(data, {
			value: checkoutCreatedSchema,
			error: checkoutErrorSchema,
		});
		if (result.status === "error") {
			return Result.err<CreatedOrder, OrderCreationFailure>(
				checkoutFailure(result.error),
			);
		}
		return Result.ok<CreatedOrder, OrderCreationFailure>({
			orderNumber: result.value.orderNumber,
			paymentNumber: result.value.paymentNumber,
			checkoutToken: result.value.checkoutToken,
		});
	} catch (error) {
		const failure = classifyOrderFailure(error);
		if (failure === undefined) throw error;
		return Result.err<CreatedOrder, OrderCreationFailure>(
			publicOrderFailure(failure),
		);
	}
};

export const createOrder = (
	payload: CheckoutOrderPayload,
	outerSignal?: AbortSignal,
) =>
	createOrderWithMutation(
		payload,
		(input, signal) =>
			storeClient().v2.order.addOrder.mutate(input, { signal }),
		outerSignal,
	);

type DeliveryZoneFailure = Extract<
	AiOperationError,
	{ _tag: "ProviderUnavailable" }
>;

export const fetchDeliveryZones = async (outerSignal?: AbortSignal) => {
	try {
		const data = await storeClient().order.getDeliveryAddressZones.query(
			undefined,
			{ signal: withTimeout(outerSignal) },
		);
		const zones = v.parse(deliveryZonesWireSchema, data);
		return Result.ok<DeliveryZoneInput[], DeliveryZoneFailure>(
			zones.map(({ Id, zoneName }) => ({ zoneId: Id, zoneName })),
		);
	} catch (error) {
		if (
			error instanceof TRPCClientError ||
			error instanceof TypeError ||
			(error instanceof DOMException && error.name === "TimeoutError")
		) {
			return Result.err<DeliveryZoneInput[], DeliveryZoneFailure>({
				_tag: "ProviderUnavailable",
				retryable: true,
			});
		}
		throw error;
	}
};
