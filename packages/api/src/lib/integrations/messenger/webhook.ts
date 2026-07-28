import { paymentQueries } from "@vit/api/queries";
import { invalidDelivery } from "@vit/shared";
import { Result } from "better-result";
import {
	type GenericWebhookPayload,
	processWebhookEvents,
} from "@warriorteam/messenger-sdk";
import { logger } from "~/lib/logger";
import { confirmPaymentAndNotify } from "~/lib/payments/transfer-confirmation";

const paymentPostbackPattern =
	/^(confirm_payment|reject_payment):([A-Za-z0-9_-]+)$/;

export async function messengerWebhookHandler(payload: GenericWebhookPayload) {
	const q = paymentQueries.store;
	let invalidPostback = false;
	await processWebhookEvents(payload, {
		onMessage: async () => {
			logger.info("messengerWebhook.onMessage", { eventType: "message" });
		},
		onMessageEdit: async () => {
			logger.info("messengerWebhook.onMessageEdit", {
				eventType: "message_edit",
			});
		},
		onMessageReaction: async () => {
			logger.info("messengerWebhook.onMessageReaction", {
				eventType: "message_reaction",
			});
		},
		onMessagingPostback: async (event) => {
			const payloadMatch = paymentPostbackPattern.exec(event.postback.payload);
			if (payloadMatch === null) {
				if (
					event.postback.payload.startsWith("confirm_payment") ||
					event.postback.payload.startsWith("reject_payment")
				) {
					invalidPostback = true;
				}
				return;
			}
			const [, action, paymentNumber] = payloadMatch;
			if (paymentNumber === undefined) {
				invalidPostback = true;
				return;
			}
			if (action === "confirm_payment") {
				await confirmPaymentAndNotify({
					paymentNumber,
					provider: "transfer",
					source: "messenger",
				});
				return;
			}
			await q.updatePaymentStatus(paymentNumber, "failed");
		},
	});
	return invalidPostback
		? Result.err(invalidDelivery("messenger", "invalid_payload"))
		: Result.ok(undefined);
}
