import { logger } from "~/lib/logger";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import ky from "ky";
import * as v from "valibot";
import { db } from "~/db/client";
import { DeliveryDispatchesTable } from "~/db/schema";

const API_URL = env.DELIVERY_API_URL;
const DELIVERY_ADDRESS_ZONES_CACHE_KEY = "delivery-address-zones";
const requestStartedAt = new WeakMap<Request, number>();

const truncate = (value: string, maxLength = 500) =>
	value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

export const deliveryZoneSchema = v.object({
	id: v.number(),
	zoneName: v.string(),
});

export type DeliveryZone = v.InferOutput<typeof deliveryZoneSchema>;

const deliveryZonesSchema = v.array(deliveryZoneSchema);

interface Order {
	deliveryDate: string;
	getMoney: number;
	orderDesc: string;
	orderId: number;
	orderNumber: string;
	recipientAddress: string;
	recipientAddressZoneId: number;
	recipientPhone: string;
	senderId: number;
}

interface OrderRequest {
	order: Order;
}

interface OrderResponse {
	documentNo: string;
	orderId: number;
}

interface OrderStatusResponse {
	deliveryDate: string;
	documentNo: string;
	driverComment: string;
	driverName: string;
	getMoneyAmount: number;
	moneyAmount: number | null;
	orderId: number;
	orderStatus: string;
}

interface OrderStatusNotFoundResponse {
	message: string;
	status: "notfound";
}

const deliveryClient = ky.create({
	hooks: {
		afterResponse: [
			async (request, _options, response) => {
				logger.info("delivery response", {
					durationMs: Date.now() - (requestStartedAt.get(request) ?? Date.now()),
					method: request.method,
					status: response.status,
					url: request.url,
				});
				return response;
			},
		],
		beforeError: [
			async (error) => {
				const body = await error.response.clone().text();
				logger.error("delivery error", {
					body: truncate(body),
					method: error.request.method,
					status: error.response.status,
					statusText: error.response.statusText,
					url: error.request.url,
				});
				return error;
			},
		],
		beforeRequest: [
			async (request) => {
				requestStartedAt.set(request, Date.now());
				const credentials = btoa(`${env.DELIVERY_USERNAME}:${env.DELIVERY_PASSWORD}`);
				logger.info("delivery request", {
					method: request.method,
					url: request.url,
				});
				request.headers.set("Authorization", `Basic ${credentials}`);
			},
		],
	},
	prefixUrl: API_URL,
});

export const getDeliveryAddressZones = async (): Promise<Array<DeliveryZone>> => {
	logger.info("getting delivery address zones");
	const cached = await env.vitStoreKV.get(DELIVERY_ADDRESS_ZONES_CACHE_KEY);
	if (cached) {
		logger.debug("delivery address zones cache hit");
		return v.parse(deliveryZonesSchema, JSON.parse(cached));
	}

	logger.info("delivery address zones cache miss");
	const result = v.parse(deliveryZonesSchema, await deliveryClient.get("addressZone").json());
	await env.vitStoreKV.put(DELIVERY_ADDRESS_ZONES_CACHE_KEY, JSON.stringify(result), {
		expirationTtl: 60 * 60 * 24 * 3,
	});
	logger.info("got delivery address zones", { count: result.length });
	return result;
};

const fingerprintDelivery = async (order: Omit<Order, "deliveryDate">) => {
	const bytes = new TextEncoder().encode(JSON.stringify(order));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const claimDeliveryDispatch = async (orderId: number, fingerprint: string) => {
	const database = db();
	await database
		.insert(DeliveryDispatchesTable)
		.values({
			deliveryDate: new Date().toISOString().slice(0, 10),
			fingerprint,
			orderId,
		})
		.onConflictDoNothing();

	const [dispatch] = await database
		.select()
		.from(DeliveryDispatchesTable)
		.where(eq(DeliveryDispatchesTable.orderId, orderId))
		.limit(1);
	if (!dispatch) {
		throw new Error("Хүргэлтийн оролдлогыг хадгалж чадсангүй.");
	}
	if (dispatch.fingerprint !== fingerprint) {
		logger.error("delivery dispatch payload changed", {
			orderId,
		});
		throw new Error(
			"Өмнөх хүргэлтийн оролдлогоос хойш захиалгын мэдээлэл өөрчлөгдсөн байна. TU хүргэлтийг шалгана уу.",
		);
	}
	return dispatch.deliveryDate;
};

export const createDelivery = async (
	orderId: number,
	orderNumber: string,
	phone: string,
	zoneId: number,
	address: string,
	notes: string | null,
) => {
	const order = {
		getMoney: 0,
		orderDesc: notes ?? "",
		orderId,
		orderNumber,
		recipientAddress: address,
		recipientAddressZoneId: zoneId,
		recipientPhone: phone,
		senderId: Number(env.DELIVERY_SENDERID),
	};
	const fingerprint = await fingerprintDelivery(order);
	const deliveryDate = await claimDeliveryDispatch(orderId, fingerprint);
	const payload: OrderRequest = {
		order: {
			...order,
			deliveryDate,
		},
	};

	logger.info("creating delivery", {
		orderId,
		orderNumber,
		phoneLast4: `${phone}`.slice(-4),
		senderId: payload.order.senderId,
		zoneId,
	});

	let result: OrderResponse;
	try {
		result = await deliveryClient
			.post("setDelivery", {
				json: payload,
			})
			.json<OrderResponse>();
	} catch (createError) {
		try {
			const existing = await getDeliveryStatus(orderId);
			if (
				"documentNo" in existing &&
				existing.documentNo.endsWith(orderNumber) &&
				existing.orderStatus !== "Цуцлагдсан"
			) {
				logger.warn("delivery reconciled after create error", {
					deliveryOrderId: existing.orderId,
					documentNo: existing.documentNo,
					orderId,
					orderNumber,
					orderStatus: existing.orderStatus,
				});
				return {
					documentNo: existing.documentNo,
					orderId: existing.orderId,
				};
			}
		} catch (lookupError) {
			logger.warn("delivery reconciliation lookup failed", {
				error: lookupError instanceof Error ? lookupError.message : String(lookupError),
				orderId,
				orderNumber,
			});
		}
		throw createError;
	}

	logger.info("delivery created", {
		deliveryOrderId: result.orderId,
		documentNo: result.documentNo,
		orderId,
		orderNumber,
	});
	return result;
};

export const getDeliveryStatus = async (
	orderId: number,
): Promise<OrderStatusResponse | OrderStatusNotFoundResponse> => {
	logger.info("getting delivery status", { orderId });
	const result = await deliveryClient.get(`setdelivery/${orderId}`).json<OrderStatusResponse>();
	logger.info("delivery status", { orderId, result });
	return result;
};
