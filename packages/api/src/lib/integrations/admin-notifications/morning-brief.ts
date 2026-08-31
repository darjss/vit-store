import { orderQueries } from "~/queries/orders";
import { formatMoney } from "./format";
import {
	TELEGRAM_CALLBACK_ACTIONS,
	bindTelegramCallbackData,
} from "./telegram-callback-data";
import {
	getTelegramAdminConfig,
	sendTelegramText,
	sendTelegramTextReturningId,
	setTelegramInlineButtons,
} from "./telegram";

const TELEGRAM_TEXT_LIMIT = 4000;

type PaidPendingOrder = Awaited<
	ReturnType<typeof orderQueries.admin.getPaginatedOrders>
>["orders"][number];

const fetchAllPaidPendingOrders = async () => {
	const orders: PaidPendingOrder[] = [];
	for (let page = 1; ; page += 1) {
		const result = await orderQueries.admin.getPaginatedOrders({
			page,
			pageSize: 50,
			orderStatus: "pending",
			paymentStatus: "success",
		});
		orders.push(...result.orders);
		if (!result.pagination.hasNextPage) break;
	}
	return orders;
};

const formatOrderLines = (orders: PaidPendingOrder[], dashUrl: string) =>
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

const chunkTextBlocks = (header: string, blocks: string[]) => {
	const chunks: string[] = [];
	let current = header;

	const flush = () => {
		if (current.trim()) chunks.push(current);
		current = "";
	};

	for (const block of blocks) {
		const candidate = current ? `${current}\n\n${block}` : block;
		if (candidate.length <= TELEGRAM_TEXT_LIMIT) {
			current = candidate;
			continue;
		}
		if (current) flush();
		if (block.length <= TELEGRAM_TEXT_LIMIT) {
			current = block;
			continue;
		}
		for (let index = 0; index < block.length; index += TELEGRAM_TEXT_LIMIT) {
			chunks.push(block.slice(index, index + TELEGRAM_TEXT_LIMIT));
		}
	}

	flush();
	return chunks;
};

export const sendMorningOrderBrief = async (dashUrl: string) => {
	const orders = await fetchAllPaidPendingOrders();
	const base = dashUrl.replace(/\/$/, "");

	if (orders.length === 0) {
		await sendTelegramText("🌅 Өглөөний тайлан\n\nИлгээх төлбөртэй захиалга алга.");
		return;
	}

	const header = `🌅 Өглөөний захиалга (${orders.length})`;
	const chunks = chunkTextBlocks(header, formatOrderLines(orders, base));
	for (const chunk of chunks) {
		await sendTelegramText(chunk);
	}

	const actionMessageId = await sendTelegramTextReturningId(
		`📦 ${orders.length} захиалга — бүгдийг илгээх үү?`,
	);
	await setTelegramInlineButtons(actionMessageId, [
		{
			text: "📦 Бүгдийг илгээх",
			callback_data: bindTelegramCallbackData(
				TELEGRAM_CALLBACK_ACTIONS.SHIP_ALL,
				actionMessageId,
			),
		},
	]);
};

export const runMorningOrderBrief = async () => {
	if (!getTelegramAdminConfig()) return;
	const dashUrl = process.env.DASH_URL?.trim();
	if (!dashUrl) throw new Error("DASH_URL must be set");
	await sendMorningOrderBrief(dashUrl);
};
