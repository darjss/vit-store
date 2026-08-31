import {
	buildOrderDetailsText,
	buildTransferClaimedText,
} from "./format";
import {
	sendTelegramPhoto,
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

const sendProductPhotos = async (
	products: DetailedOrderNotificationInput["products"],
) => {
	for (const product of products) {
		if (!product.imageUrl) continue;
		try {
			await sendTelegramPhoto(
				product.imageUrl,
				`${product.name} x${product.quantity}`,
			);
		} catch {
			// Skip broken/missing images; order text already sent.
		}
	}
};

export const sendDetailedOrderNotification = async (
	data: DetailedOrderNotificationInput,
) => {
	if (data.status === "payment_confirmed") {
		await sendTelegramText("Төлбөр амжилттай баталгаажлаа.");
	}

	const body = [
		buildOrderDetailsText(data),
		"",
		`Admin: ${dashUrl()}/orders`,
	].join("\n");

	await sendTelegramText(body);
	await sendProductPhotos(data.products);
};

export const sendTransferClaimedNotification = async (
	data: TransferClaimedNotificationInput,
) => {
	await sendTelegramText(buildTransferClaimedText(data, dashUrl()));
	await sendProductPhotos(data.products);
};
