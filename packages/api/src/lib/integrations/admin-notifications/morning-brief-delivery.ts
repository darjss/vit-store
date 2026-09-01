import { formatMoney } from "./format";
import {
	TELEGRAM_CALLBACK_ACTIONS,
	bindTelegramCallbackData,
} from "./telegram-callback-data";
import {
	sendTelegramText,
	sendTelegramTextReturningId,
	setTelegramInlineButtons,
} from "./telegram";

const TELEGRAM_TEXT_LIMIT = 4000;

export type MorningBriefOrder = {
	orderNumber: string;
	total: number;
	customerPhone: string;
	products: Array<{ name: string; quantity: number }>;
};

const formatOrderLines = (orders: MorningBriefOrder[], dashUrl: string) =>
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

export const deliverMorningOrderBrief = async (
	orders: MorningBriefOrder[],
	dashUrl: string,
) => {
	const base = dashUrl.replace(/\/$/, "");

	if (orders.length === 0) {
		await sendTelegramText(
			"🌅 Өглөөний тайлан\n\nӨчигдрийн 11:00-с хойш төлбөртэй захиалга алга.",
		);
		return;
	}

	const header = `🌅 Өглөөний захиалга (${orders.length})`;
	for (const chunk of chunkTextBlocks(header, formatOrderLines(orders, base))) {
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
