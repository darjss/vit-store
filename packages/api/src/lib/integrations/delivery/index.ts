import { logger } from "~/lib/logger";
import { env } from "cloudflare:workers";
import ky from "ky";

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

export const createDelivery = async (
	orderId: number,
	orderNumber: string,
	phone: string,
	zoneId: number,
	address: string,
	notes: string | null,
) => {
	const payload: OrderRequest = {
		order: {
			orderId,
			orderNumber,
			recipientPhone: phone,
			recipientAddressZoneId: zoneId,
			recipientAddress: address,
			deliveryDate: new Date().toISOString().slice(0, 10),
			orderDesc: notes ?? "",
			senderId: Number(env.DELIVERY_SENDERID),
			getMoney: 0,
		},
	};

	logger.info("creating delivery", {
		orderId,
		orderNumber,
		zoneId,
		phoneLast4: `${phone}`.slice(-4),
		senderId: payload.order.senderId,
	});

	const result = await deliveryClient
		.post("setDelivery", {
			json: payload,
		})
		.json<OrderResponse>();

	logger.info("delivery created", {
		orderId,
		orderNumber,
		deliveryOrderId: result.orderId,
		documentNo: result.documentNo,
	});
	return result;
};

export const getDeliveryStatus = async (orderId: number) => {
	logger.info("getting delivery status", { orderId });
	const result = await deliveryClient
		.get(`setdelivery/${orderId}`)
		.json<OrderStatusResponse>();
	logger.info("delivery status", { orderId, result });
	return result;
};
