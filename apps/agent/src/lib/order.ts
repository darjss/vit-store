import { TRPCClientError } from "@trpc/client";
import type {
	AiOperationError,
	AssistantCheckoutError,
	CheckoutOrderPayload,
	CreatedOrder,
	DeliveryZoneInput,
} from "@vit/assistant";
import { Result } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

const ORDER_FETCH_TIMEOUT_MS = 20_000;

const createdOrderSchema = v.strictObject({
	orderNumber: v.string(),
	paymentNumber: v.nullable(v.string()),
	checkoutToken: v.nullable(v.string()),
}) satisfies v.GenericSchema<unknown, CreatedOrder>;

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
			retryable: false,
			recovery: { _tag: "CheckOrderHistory" },
		}),
		PermanentOrderFailure: () => ({
			_tag: "OrderCreationFailed",
			retryable: false,
			recovery: { _tag: "ContactSupport" },
		}),
	});

export const createOrder = async (
	payload: CheckoutOrderPayload,
	outerSignal?: AbortSignal,
) => {
	let data: unknown;
	try {
		data = await storeClient().order.addOrder.mutate(payload, {
			signal: withTimeout(outerSignal, ORDER_FETCH_TIMEOUT_MS),
		});
	} catch (error) {
		const failure = classifyOrderFailure(error);
		if (failure === undefined) throw error;
		return Result.err<CreatedOrder, OrderCreationFailure>(
			publicOrderFailure(failure),
		);
	}

	const parsed = v.safeParse(createdOrderSchema, data);
	if (!parsed.success) {
		return Result.err<CreatedOrder, OrderCreationFailure>(
			publicOrderFailure({ _tag: "AmbiguousOrderFailure" }),
		);
	}
	return Result.ok<CreatedOrder, OrderCreationFailure>(parsed.output);
};

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
