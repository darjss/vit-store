import {
	buildOrderDetailsText,
	buildTransferClaimedText,
} from "./format";
import {
	sendTelegramProductImages,
	sendTelegramText,
} from "./telegram";
import type {
	DetailedOrderNotificationInput,
	TransferClaimedNotificationInput,
} from "./types";

const dashUrl = () => {
	const url = process.env.DASH_URL?.trim();
	if (!url) throw new Error("DASH_URL must be set");
	return url.replace(/\/$/, "");
};

export const sendDetailedOrderNotification = async (
	data: DetailedOrderNotificationInput,
) => {
	await sendTelegramText(buildOrderDetailsText(data, dashUrl()));
	await sendTelegramProductImages(data.products);
};

export const sendTransferClaimedNotification = async (
	data: TransferClaimedNotificationInput,
) => {
	await sendTelegramText(buildTransferClaimedText(data, dashUrl()));
	await sendTelegramProductImages(data.products);
};
