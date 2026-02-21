import { paymentQueries } from "@vit/api/queries";
import {
	type GenericWebhookPayload,
	processWebhookEvents,
} from "@warriorteam/messenger-sdk";
import { logger } from "../../../lib/logger";
import { sendDetailedOrderNotification } from "./messages";

export async function messengerWebhookHandler(payload: GenericWebhookPayload) {
	const q = paymentQueries.store;
	return await processWebhookEvents(payload, {
		onMessage: async (event) => {
			const userId = event.sender.id;
			logger.info("messengerWebhook.onMessage", {
				userId,
				text: event.message.text,
			});
		},
		onMessageEdit: async (event) => {
			logger.info("messengerWebhook.onMessageEdit", {
				text: event.message_edit.text,
			});
		},
		onMessageReaction: async (event) => {
			logger.info("messengerWebhook.onMessageReaction", {
				reaction: event.reaction.reaction,
			});
		},
		onMessagingPostback: async (event) => {
			logger.info("messengerWebhook.onMessagingPostback", {
				payload: event.postback.payload,
			});
			const paymentNumber = event.postback.payload.split(":")[1];
			if (event.postback.payload.startsWith("confirm_payment")) {
				logger.info("messengerWebhook.confirmPayment", { paymentNumber });
				if (!paymentNumber) {
					logger.error("messengerWebhook.paymentNumberNotFound", {
						payload: event.postback.payload,
					});
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
					logger.error(
						"messengerWebhook.sendNotificationFailed",
						notificationError,
					);
				}
			} else if (event.postback.payload.startsWith("reject_payment")) {
				logger.info("messengerWebhook.rejectPayment", { paymentNumber });
				if (!paymentNumber) {
					logger.error("messengerWebhook.paymentNumberNotFound", {
						payload: event.postback.payload,
					});
					return;
				}
				await q.updatePaymentStatus(paymentNumber, "failed");
			}
		},
	});
}
