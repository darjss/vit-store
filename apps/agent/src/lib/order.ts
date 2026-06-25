import type {
	CheckoutOrderPayload,
	CreatedOrder,
	DeliveryZoneInput,
} from "@vit/assistant";
import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

// Boundary to the EXISTING store order API. Order creation lives in the api
// package (`order.addOrder`, store router) and zone listing in
// `order.getDeliveryAddressZones`; the agent only calls them over the same tRPC
// surface the storefront uses, so the order/total/zone logic is never
// duplicated here. This rides the SHARED typed tRPC client (`storeClient()` in
// ./store-client) the storefront pattern uses, so only @trpc/client + superjson
// reach the worker bundle — zero server/db code.
//
// CRITICAL: the agent passes only line quantities; `order.addOrder` recomputes
// the authoritative total from its own catalog and adds the 6,000 MNT delivery
// fee. The agent never computes totals.

// Order creation may do real DB + delivery + notification work, so give it a
// longer deadline than the catalog read while still bounding a hung store API.
const ORDER_FETCH_TIMEOUT_MS = 20_000;

// Wire shape of `order.addOrder`'s return value. Validated at the boundary so
// any api-side drift fails loudly here instead of handing the payment slices a
// missing order/payment number.
const createdOrderSchema = v.object({
	orderNumber: v.string(),
	paymentNumber: v.nullable(v.string()),
	checkoutToken: v.nullable(v.string()),
}) satisfies v.GenericSchema<unknown, CreatedOrder>;

// Live delivery zones (`{ Id, zoneName }`) mapped to the ranker's input shape.
const deliveryZonesWireSchema = v.array(
	v.object({ Id: v.number(), zoneName: v.string() }),
);

// Calls `order.addOrder` (a tRPC mutation) through the shared typed client.
export const createOrder = async (
	payload: CheckoutOrderPayload,
	outerSignal?: AbortSignal,
): Promise<CreatedOrder> => {
	const data = await storeClient().order.addOrder.mutate(payload, {
		signal: withTimeout(outerSignal, ORDER_FETCH_TIMEOUT_MS),
	});
	// Defense-in-depth: the typed client gives compile-time safety, but the
	// valibot guard still fails loudly on RUNTIME api-side shape drift.
	return v.parse(createdOrderSchema, data);
};

// Fetches the live delivery zones (KV-cached server-side) for the ranker.
export const fetchDeliveryZones = async (
	outerSignal?: AbortSignal,
): Promise<DeliveryZoneInput[]> => {
	const data = await storeClient().order.getDeliveryAddressZones.query(
		undefined,
		{ signal: withTimeout(outerSignal) },
	);
	const zones = v.parse(deliveryZonesWireSchema, data);
	return zones.map((z) => ({ zoneId: z.Id, zoneName: z.zoneName }));
};
