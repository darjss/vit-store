import { paymentQueries } from "@vit/api/queries";
import {
	type GenericWebhookPayload,
	processWebhookEvents,
} from "@warriorteam/messenger-sdk";
import { logger } from "~/lib/logger";
import { confirmPaymentAndNotify } from "~/lib/payments/transfer-confirmation";

export async function messengerWebhookHandler(payload: GenericWebhookPayload) {
	const q = paymentQueries.store;
	return await processWebhookEvents(payload, {
		onMessage: async (event) => {
			const userId = event.sender.id;
			const text = event.message.text?.trim();
			logger.info("messengerWebhook.onMessage", {
				userId,
				text,
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
				const result = await confirmPaymentAndNotify({
					paymentNumber,
					provider: "transfer",
					source: "messenger",
				});
				result.match({
					ok: ({ newlyConfirmed, recoveryPending }) => {
						logger.info("messengerWebhook.paymentConfirmationHandled", {
							paymentNumber,
							newlyConfirmed,
							recoveryPending,
						});
					},
					err: (error) => {
						logger.info("messengerWebhook.paymentConfirmationRejected", {
							paymentNumber,
							errorTag: error._tag,
						});
					},
				});
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
