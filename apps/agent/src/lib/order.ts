import type {
	CheckoutOrderPayload,
	CreatedOrder,
	DeliveryZoneInput,
} from "@vit/assistant";
import { SuperJSON } from "superjson";
import * as v from "valibot";

// Boundary to the EXISTING store order API. Order creation lives in the api
// package (`order.addOrder`, store router) and zone listing in
// `order.getDeliveryAddressZones`; the agent only calls them over the same tRPC
// surface the storefront uses, so the order/total/zone logic is never
// duplicated here. A thin hand-rolled tRPC transport (mirroring
// `src/lib/catalog.ts`) keeps the worker free of the heavy api/tRPC type graph.
//
// CRITICAL: the agent passes only line quantities; `order.addOrder` recomputes
// the authoritative total from its own catalog and adds the 6,000 MNT delivery
// fee. The agent never computes totals.
const storeApiUrl = (): string => {
	const base = process.env.STORE_API_URL ?? "http://localhost:3000";
	return `${base.replace(/\/+$/, "")}/trpc/store`;
};

interface TrpcResponse {
	result?: { data?: unknown };
	error?: { message?: string };
}

// Order creation may do real DB + delivery + notification work, so give it a
// longer deadline than the catalog read while still bounding a hung store API.
const ORDER_FETCH_TIMEOUT_MS = 20_000;
const ZONES_FETCH_TIMEOUT_MS = 10_000;

const signal = (ms: number, outer?: AbortSignal): AbortSignal => {
	const timeout = AbortSignal.timeout(ms);
	return outer ? AbortSignal.any([outer, timeout]) : timeout;
};

const readTrpc = async <T>(
	procedure: string,
	response: Response,
	schema: v.GenericSchema<unknown, T>,
): Promise<T> => {
	if (!response.ok) {
		throw new Error(`${procedure} request failed (${response.status})`);
	}
	const body = (await response.json()) as TrpcResponse;
	if (body.error || !body.result) {
		throw new Error(body.error?.message ?? `${procedure} returned an error`);
	}
	const deserialized = SuperJSON.deserialize(
		body.result.data as Parameters<typeof SuperJSON.deserialize>[0],
	);
	return v.parse(schema, deserialized);
};

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

// Calls `order.addOrder` (a tRPC mutation) via a non-batched POST. With the
// SuperJSON transformer the request body IS the serialized input; the response
// envelope matches the catalog GET path.
export const createOrder = async (
	payload: CheckoutOrderPayload,
	outerSignal?: AbortSignal,
): Promise<CreatedOrder> => {
	const url = `${storeApiUrl()}/order.addOrder`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(SuperJSON.serialize(payload)),
		signal: signal(ORDER_FETCH_TIMEOUT_MS, outerSignal),
	});
	return readTrpc("order.addOrder", response, createdOrderSchema);
};

// Fetches the live delivery zones (KV-cached server-side) for the ranker.
export const fetchDeliveryZones = async (
	outerSignal?: AbortSignal,
): Promise<DeliveryZoneInput[]> => {
	const url = `${storeApiUrl()}/order.getDeliveryAddressZones?input=${encodeURIComponent(
		JSON.stringify(SuperJSON.serialize(undefined)),
	)}`;
	const response = await fetch(url, {
		method: "GET",
		headers: { "content-type": "application/json" },
		signal: signal(ZONES_FETCH_TIMEOUT_MS, outerSignal),
	});
	const zones = await readTrpc(
		"order.getDeliveryAddressZones",
		response,
		deliveryZonesWireSchema,
	);
	return zones.map((z) => ({ zoneId: z.Id, zoneName: z.zoneName }));
};
