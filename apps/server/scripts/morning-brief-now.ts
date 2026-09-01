import { createTRPCClient, httpLink } from "@trpc/client";
import type { BotRouter } from "@vit/api";
import { deliverMorningOrderBrief } from "@vit/api/lib/integrations/admin-notifications/morning-brief-delivery";
import { morningBriefOrderSince } from "@vit/api/lib/integrations/admin-notifications/morning-brief-window";
import { getTelegramAdminConfig } from "@vit/api/lib/integrations/admin-notifications/telegram";
import { SuperJSON } from "superjson";

const requiredEnv = (name: string) => {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} must be set`);
	return value;
};

const client = createTRPCClient<BotRouter>({
	links: [
		httpLink({
			url: `${requiredEnv("PUBLIC_API_URL").replace(/\/+$/, "")}/trpc/bot`,
			transformer: SuperJSON,
			headers: () => ({ "X-Admin-Bot-Token": requiredEnv("ADMIN_BOT_TOKEN") }),
		}),
	],
});

const fetchMorningBriefOrders = async () => {
	const createdAfter = morningBriefOrderSince();
	try {
		const orders: Awaited<
			ReturnType<BotRouter["order"]["getPaginatedOrders"]["query"]>
		>["orders"] = [];
		for (let page = 1; ; page += 1) {
			const result = await client.order.getPaginatedOrders.query({
				page,
				pageSize: 50,
				orderStatus: "pending",
				paymentStatus: "success",
				createdAfter,
			});
			orders.push(...result.orders);
			if (!result.pagination.hasNextPage) break;
		}
		return orders;
	} catch {
		const pending = await client.order.getPendingOrders.query();
		return pending.filter(
			(order) =>
				order.paymentStatus === "success" &&
				new Date(order.createdAt) >= createdAfter,
		);
	}
};

if (!getTelegramAdminConfig()) {
	throw new Error("TELEGRAM_ADMIN_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID must be set");
}

const orders = await fetchMorningBriefOrders();
await deliverMorningOrderBrief(orders, requiredEnv("DASH_URL"));
console.log(
	`morning brief sent (${orders.length} paid pending orders since ${morningBriefOrderSince().toISOString()})`,
);
