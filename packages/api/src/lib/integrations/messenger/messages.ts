import type { newOrderType } from "@vit/shared";
import { messenger } from "./client";

const RECIPIENT_ID = "25172502442390308";

type DetailedOrderNotificationInput = {
	paymentNumber: string;
	customerPhone: number;
	address: string;
	notes: string | null;
	total: number;
	products: Array<{
		name: string;
		quantity: number;
		price: number;
		imageUrl?: string;
	}>;
	status: "pending_transfer" | "payment_confirmed";
};

const formatMoney = (amount: number) => `${amount.toLocaleString("en-US")} MNT`;

const buildOrderDetailsText = (data: DetailedOrderNotificationInput) => {
	const title =
		data.status === "payment_confirmed"
			? "Tulbur batalgaajsan zahialga"
			: "Shine zahialga (transfer tulbur batalgaajuulna)";

	const productLines = data.products.map(
		(product, index) =>
			`${index + 1}. ${product.name} x${product.quantity} - ${formatMoney(product.price)}`,
	);

	const notes = data.notes?.trim() ? data.notes : "-";

	return [
		title,
		`Utas: ${data.customerPhone}`,
		`Hayag: ${data.address}`,
		`Temdeglel: ${notes}`,
		`Niit dun: ${formatMoney(data.total)}`,
		"Buteegdehuun:",
		...productLines,
	].join("\n");
};

const sendProductImagesIfPossible = async (
	products: DetailedOrderNotificationInput["products"],
) => {
	for (const product of products) {
		if (!product.imageUrl) {
			continue;
		}

		const imageMessagePayload = {
			messaging_type: "RESPONSE",
			recipient: { id: RECIPIENT_ID },
			message: {
				attachment: {
					type: "image",
					payload: {
						url: product.imageUrl,
						is_reusable: true,
					},
				},
			},
		} as unknown as Parameters<typeof messenger.send.message>[0];

		try {
			await messenger.send.message(imageMessagePayload);
		} catch {
			await messenger.send.message({
				messaging_type: "RESPONSE",
				recipient: { id: RECIPIENT_ID },
				message: { text: `${product.name} zurag: ${product.imageUrl}` },
			});
		}
	}
};

export const sendOrderNotification = async (order: newOrderType) => {
	const message = `Шинэ захиалга ирлээ: ${order.phoneNumber}`;
	const result = await messenger.send.message({
		messaging_type: "RESPONSE",
		recipient: { id: RECIPIENT_ID },
		message: { text: message },
	});
	return result;
};

export const sendTransferNotification = async (
	paymentNumber: string,
	amount: number,
) => {
	const message = `Шинэ шилжүүлэг  ${amount}`;
	console.log("sending transfer notification to messenger", message);
	const result = await messenger.templates.button({
		recipient: { id: RECIPIENT_ID },

		text: message,
		buttons: [
			{
				type: "postback",
				title: "Баталгаажуулах",
				payload: `confirm_payment:${paymentNumber}`,
			},
			{
				type: "postback",
				title: "Цуцлах",
				payload: `reject_payment:${paymentNumber}`,
			},
		],
	});
	return result;
};

export const sendDetailedOrderNotification = async (
	data: DetailedOrderNotificationInput,
) => {
	if (data.status === "pending_transfer") {
		await messenger.templates.button({
			recipient: { id: RECIPIENT_ID },
			text: "Transfer tulbur irsen. Batalgaajuulna uu.",
			buttons: [
				{
					type: "postback",
					title: "Batalgaajuulah",
					payload: `confirm_payment:${data.paymentNumber}`,
				},
				{
					type: "postback",
					title: "Tsutslah",
					payload: `reject_payment:${data.paymentNumber}`,
				},
			],
		});
	}

	if (data.status === "payment_confirmed") {
		await messenger.send.message({
			messaging_type: "RESPONSE",
			recipient: { id: RECIPIENT_ID },
			message: { text: "Tulbur amjilttai batalgaajlaa." },
		});
	}

	await messenger.send.message({
		messaging_type: "RESPONSE",
		recipient: { id: RECIPIENT_ID },
		message: { text: buildOrderDetailsText(data) },
	});

	await sendProductImagesIfPossible(data.products);
};
