import { createAdminBotClient } from "./admin-bot-client";

type ShipPaidOrdersResult = {
	shipped: string[];
	skipped: { orderNumber: string; reason: string }[];
};

const PAGE_SIZE = 50;

export const shipAllPaidPendingOrders = async (input: {
	storeApiUrl: string;
	botToken: string;
}): Promise<ShipPaidOrdersResult> => {
	const client = createAdminBotClient(input.storeApiUrl, input.botToken);
	const shipped: string[] = [];
	const skipped: ShipPaidOrdersResult["skipped"] = [];

	for (let page = 1; ; page += 1) {
		const result = await client.order.getPaginatedOrders.query({
			page,
			pageSize: PAGE_SIZE,
			orderStatus: "pending",
			paymentStatus: "success",
		});

		for (const order of result.orders) {
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

		if (!result.pagination.hasNextPage) break;
	}

	return { shipped, skipped };
};
