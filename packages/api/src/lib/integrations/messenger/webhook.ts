import { paymentQueries } from "@vit/api/queries";
import {
	type GenericWebhookPayload,
	processWebhookEvents,
} from "@warriorteam/messenger-sdk";
import { sendDetailedOrderNotification } from "./messages";

export async function messengerWebhookHandler(payload: GenericWebhookPayload) {
	const q = paymentQueries.store;
	return await processWebhookEvents(payload, {
		onMessage: async (event) => {
			const userId = event.sender.id;
			console.log(
				`Received message: ${event.message.text} from user ${userId}`,
			);
		},
		onMessageEdit: async (event) => {
			// TypeScript knows this is MessageEditWebhookEvent
			console.log(`Message edited to: ${event.message_edit.text}`);
		},
		onMessageReaction: async (event) => {
			// TypeScript knows this is MessageReactionWebhookEvent
			console.log(`Reaction: ${event.reaction.reaction}`);
		},
		onMessagingPostback: async (event) => {
			console.log("event", event);
			console.log(`Postback: ${event.postback.payload}`);
			const paymentNumber = event.postback.payload.split(":")[1];
			if (event.postback.payload.startsWith("confirm_payment")) {
				console.log("confirming payment", paymentNumber);
				if (!paymentNumber) {
					console.error("Payment number not found");
					return;
				}
				await q.updatePaymentStatus(paymentNumber, "success");
				try {
					const paymentInfo = await q.getPaymentInfoByNumber(paymentNumber);
					if (paymentInfo) {
						await sendDetailedOrderNotification({
							paymentNumber,
							customerPhone: paymentInfo.order.customerPhone,
							address: paymentInfo.order.address,
							notes: paymentInfo.order.notes,
							total: paymentInfo.order.total,
							products: paymentInfo.order.orderDetails.map((detail) => ({
								name: detail.product.name,
								quantity: detail.quantity,
								price: detail.product.price,
								imageUrl: detail.product.images[0]?.url,
							})),
							status: "payment_confirmed",
						});
					}
				} catch (notificationError) {
					console.error(
						"Failed to send payment confirmed notification",
						notificationError,
					);
				}
			} else if (event.postback.payload.startsWith("reject_payment")) {
				console.log("rejecting payment", paymentNumber);
				if (!paymentNumber) {
					console.error("Payment number not found");
					return;
				}
				await q.updatePaymentStatus(paymentNumber, "failed");
			}
		},
	});
}
