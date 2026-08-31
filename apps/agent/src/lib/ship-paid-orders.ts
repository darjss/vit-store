import { createAdminBotClient } from "./admin-bot-client";

type ShipPaidOrdersResult = {
	shipped: string[];
	skipped: { orderNumber: string; reason: string }[];
};

export const shipAllPaidPendingOrders = async (input: {
	storeApiUrl: string;
	botToken: string;
}): Promise<ShipPaidOrdersResult> => {
	const client = createAdminBotClient(input.storeApiUrl, input.botToken);
	const { orders } = await client.order.getPaginatedOrders.query({
		page: 1,
		pageSize: 50,
		orderStatus: "pending",
		paymentStatus: "success",
	});

	const shipped: string[] = [];
	const skipped: ShipPaidOrdersResult["skipped"] = [];

	for (const order of orders) {
		if (!order.addressZoneId) {
			skipped.push({
				orderNumber: order.orderNumber,
				reason: "addressZoneId байхгүй",
			});
			continue;
		}
		try {
			await client.order.shipOrder.mutate({
				orderId: order.id,
				addressZoneId: order.addressZoneId,
			});
			shipped.push(order.orderNumber);
		} catch (error) {
			skipped.push({
				orderNumber: order.orderNumber,
				reason:
					error instanceof Error ? error.message : "илгээхэд алдаа гарлаа",
			});
		}
	}

	return { shipped, skipped };
};
