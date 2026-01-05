import type { newOrderType } from "@vit/shared";
import { messenger } from "./client";

export const sendOrderNotification = async (order: newOrderType) => {
	const message = `Шинэ захиалга ирлээ: ${order.phoneNumber}`;
	const result = await messenger.send.message({
		messaging_type: "RESPONSE",
		recipient: { id: "25172502442390308" },
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
		recipient: { id: "25172502442390308" },

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
