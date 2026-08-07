import { logger } from "~/lib/logger";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import ky from "ky";
import { db } from "~/db/client";
import { DeliveryDispatchesTable } from "~/db/schema";

const API_URL = env.DELIVERY_API_URL;
const DELIVERY_ADDRESS_ZONES_CACHE_KEY = "delivery-address-zones";
const requestStartedAt = new WeakMap<Request, number>();

const truncate = (value: string, maxLength = 500) =>
	value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;

export interface DeliveryZone {
	Id: number;
	zoneName: string;
}

interface Order {
	orderId: number;
	orderNumber: string;
	recipientPhone: string;
	recipientAddressZoneId: number;
	recipientAddress: string;
	deliveryDate: string;
	orderDesc: string;
	senderId: number;
	getMoney: number;
}

interface OrderRequest {
	order: Order;
}

interface OrderResponse {
	orderId: number;
	documentNo: string;
}

interface OrderStatusResponse {
	orderId: number;
	documentNo: string;
	deliveryDate: string;
	orderStatus: string;
	getMoneyAmount: number;
	moneyAmount: number | null;
	driverName: string;
	driverComment: string;
}

interface OrderStatusNotFoundResponse {
	status: "notfound";
	message: string;
}

const deliveryClient = ky.create({
	prefixUrl: API_URL,
	hooks: {
		beforeRequest: [
			async (request) => {
				requestStartedAt.set(request, Date.now());
				const credentials = btoa(
					`${env.DELIVERY_USERNAME}:${env.DELIVERY_PASSWORD}`,
				);
				logger.info("delivery request", {
					method: request.method,
					url: request.url,
				});
				request.headers.set("Authorization", `Basic ${credentials}`);
			},
		],
		afterResponse: [
			async (request, _options, response) => {
				logger.info("delivery response", {
					method: request.method,
					url: request.url,
					status: response.status,
					durationMs: Date.now() - (requestStartedAt.get(request) ?? Date.now()),
				});
				return response;
			},
		],
		beforeError: [
			async (error) => {
				const body = await error.response.clone().text();
				logger.error("delivery error", {
					method: error.request.method,
					url: error.request.url,
					status: error.response.status,
					statusText: error.response.statusText,
					body: truncate(body),
				});
				return error;
			},
		],
	},
});

export const getDeliveryAddressZones = async (): Promise<DeliveryZone[]> => {
	logger.info("getting delivery address zones");
	const cached = await env.vitStoreKV.get(DELIVERY_ADDRESS_ZONES_CACHE_KEY);
	if (cached) {
		logger.debug("delivery address zones cache hit");
		return JSON.parse(cached) as DeliveryZone[];
	}

	logger.info("delivery address zones cache miss");
	const response = await deliveryClient.get("addressZone").json<string>();
	const result = JSON.parse(response) as DeliveryZone[];
	await env.vitStoreKV.put(DELIVERY_ADDRESS_ZONES_CACHE_KEY, JSON.stringify(result), {
		expirationTtl: 60 * 60 * 24 * 3,
	});
	logger.info("got delivery address zones", { count: result.length });
	return result;
};

const fingerprintDelivery = async (order: Omit<Order, "deliveryDate">) => {
	const bytes = new TextEncoder().encode(JSON.stringify(order));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
};

const claimDeliveryDispatch = async (orderId: number, fingerprint: string) => {
	const database = db();
	await database
		.insert(DeliveryDispatchesTable)
		.values({
			orderId,
			fingerprint,
			deliveryDate: new Date().toISOString().slice(0, 10),
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
		orderId,
		orderNumber,
		recipientPhone: phone,
		recipientAddressZoneId: zoneId,
		recipientAddress: address,
		orderDesc: notes ?? "",
		senderId: Number(env.DELIVERY_SENDERID),
		getMoney: 0,
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
		zoneId,
		phoneLast4: `${phone}`.slice(-4),
		senderId: payload.order.senderId,
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
					orderId,
					orderNumber,
					deliveryOrderId: existing.orderId,
					documentNo: existing.documentNo,
					orderStatus: existing.orderStatus,
				});
				return {
					orderId: existing.orderId,
					documentNo: existing.documentNo,
				};
			}
		} catch (lookupError) {
			logger.warn("delivery reconciliation lookup failed", {
				orderId,
				orderNumber,
				error:
					lookupError instanceof Error
						? lookupError.message
						: String(lookupError),
			});
		}
		throw createError;
	}

	logger.info("delivery created", {
		orderId,
		orderNumber,
		deliveryOrderId: result.orderId,
		documentNo: result.documentNo,
	});
	return result;
};

export const getDeliveryStatus = async (
	orderId: number,
): Promise<OrderStatusResponse | OrderStatusNotFoundResponse> => {
	logger.info("getting delivery status", { orderId });
	const result = await deliveryClient
		.get(`setdelivery/${orderId}`)
		.json<OrderStatusResponse>();
	logger.info("delivery status", { orderId, result });
	return result;
};
