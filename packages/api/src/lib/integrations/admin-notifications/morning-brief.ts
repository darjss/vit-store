import { orderQueries } from "~/queries/orders";
import { formatMoney } from "./format";
import {
	getTelegramAdminConfig,
	sendTelegramText,
	sendTelegramTextWithButtons,
} from "./telegram";

const SHIP_ALL_CALLBACK = "ship_all";

const formatOrderLines = (
	orders: Awaited<
		ReturnType<typeof orderQueries.admin.getPaginatedOrders>
	>["orders"],
	dashUrl: string,
) =>
	orders.map((order, index) => {
		const items = order.products
			.map((p) => `${p.name} x${p.quantity}`)
			.join(", ");
		return [
			`${index + 1}. ${order.orderNumber} · ${formatMoney(order.total)} · ${order.customerPhone}`,
			items,
			`${dashUrl}/orders/${order.orderNumber}`,
		].join("\n");
	});

export const sendMorningOrderBrief = async (dashUrl: string) => {
	const { orders } = await orderQueries.admin.getPaginatedOrders({
		page: 1,
		pageSize: 50,
		orderStatus: "pending",
		paymentStatus: "success",
	});

	const base = dashUrl.replace(/\/$/, "");

	if (orders.length === 0) {
		await sendTelegramText("🌅 Өглөөний тайлан\n\nИлгээх төлбөртэй захиалга алга.");
		return;
	}

	const body = [
		`🌅 Өглөөний захиалга (${orders.length})`,
		"",
		...formatOrderLines(orders, base),
	].join("\n");

	await sendTelegramTextWithButtons(body, [
		{ text: "📦 Бүгдийг илгээх", callback_data: SHIP_ALL_CALLBACK },
	]);
};

export const runMorningOrderBrief = async () => {
	if (!getTelegramAdminConfig()) return;
	const dashUrl = process.env.DASH_URL?.trim();
	if (!dashUrl) throw new Error("DASH_URL must be set");
	await sendMorningOrderBrief(dashUrl);
};
