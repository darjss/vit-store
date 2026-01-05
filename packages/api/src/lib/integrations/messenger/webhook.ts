import { createQueries } from "@vit/api/queries";
import {
	type GenericWebhookPayload,
	processWebhookEvents,
} from "@warriorteam/messenger-sdk";
import type { DB } from "../../../db";

export async function messengerWebhookHandler(
	payload: GenericWebhookPayload,
	db: DB,
) {
	const q = createQueries(db).payments.store;
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
