export const TELEGRAM_CALLBACK_ACTIONS = {
	SHIP_ALL: "ship_all",
	STOCK_OK: "stock_ok",
	STOCK_NO: "stock_no",
	PRICE_OK: "price_ok",
	PRICE_NO: "price_no",
} as const;

const CALLBACK_RE =
	/^(ship_all|stock_ok|stock_no|price_ok|price_no):(\d+)$/;

export const bindTelegramCallbackData = (
	action: string,
	messageId: number,
) => `${action}:${messageId}`;

export const parseTelegramCallbackData = (data: string) => {
	const match = CALLBACK_RE.exec(data);
	if (!match) return { action: data, messageId: undefined };
	return { action: match[1], messageId: Number(match[2]) };
};

export const bindTelegramButtonCallbacks = (
	buttons: Array<{ text: string; callback_data: string }>,
	messageId: number,
) =>
	buttons.map((button) => ({
		text: button.text,
		callback_data: /:\d+$/.test(button.callback_data)
			? button.callback_data
			: bindTelegramCallbackData(button.callback_data, messageId),
	}));
