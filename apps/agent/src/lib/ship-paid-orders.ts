import { morningBriefOrderSince } from "@vit/api/lib/integrations/admin-notifications/morning-brief-window";
import { createAdminBotClient } from "./admin-bot-client";

type ShipPaidOrdersResult = {
	shipped: Array<string>;
	skipped: Array<{ orderNumber: string; reason: string }>;
};

const PAGE_SIZE = 50;

export const shipAllPaidPendingOrders = async (input: {
	botToken: string;
	storeApiUrl: string;
}): Promise<ShipPaidOrdersResult> => {
	const client = createAdminBotClient(input.storeApiUrl, input.botToken);
	const shipped: Array<string> = [];
	const skipped: ShipPaidOrdersResult["skipped"] = [];
	const createdAfter = morningBriefOrderSince();

	for (let page = 1; ; page += 1) {
		const result = await client.order.getPaginatedOrders.query({
			orderStatus: "pending",
			page,
			pageSize: PAGE_SIZE,
			paymentStatus: "success",
			createdAfter,
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
					addressZoneId: order.addressZoneId,
					orderId: order.id,
				});
				shipped.push(order.orderNumber);
			} catch (error) {
				skipped.push({
					orderNumber: order.orderNumber,
					reason: error instanceof Error ? error.message : "илгээхэд алдаа гарлаа",
				});
			}
		}

		if (!result.pagination.hasNextPage) {
			break;
		}
	}

	return { shipped, skipped };
};
