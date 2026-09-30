import { orderQueries } from "~/queries/orders";
import { deliverMorningOrderBrief } from "./morning-brief-delivery";
import { morningBriefOrderSince } from "./morning-brief-window";
import { getTelegramAdminConfig } from "./telegram";

type PaidPendingOrder = Awaited<
	ReturnType<typeof orderQueries.admin.getPaginatedOrders>
>["orders"][number];

const fetchMorningBriefOrders = async () => {
	const since = morningBriefOrderSince();
	const orders: Array<PaidPendingOrder> = [];
	for (let page = 1; ; page += 1) {
		const result = await orderQueries.admin.getPaginatedOrders({
			createdAfter: since,
			orderStatus: "pending",
			page,
			pageSize: 50,
			paymentStatus: "success",
		});
		orders.push(...result.orders);
		if (!result.pagination.hasNextPage) {
			break;
		}
	}
	return orders;
};

export const sendMorningOrderBrief = async (dashUrl: string) => {
	const orders = await fetchMorningBriefOrders();
	await deliverMorningOrderBrief(orders, dashUrl);
};

export const runMorningOrderBrief = async () => {
	if (!getTelegramAdminConfig()) {
		return;
	}
	const dashUrl = process.env.DASH_URL?.trim();
	if (!dashUrl) {
		throw new Error("DASH_URL must be set");
	}
	await sendMorningOrderBrief(dashUrl);
};
