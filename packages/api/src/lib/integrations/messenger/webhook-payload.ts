import * as v from "valibot";

const webhookSenderSchema = v.object({
	id: v.string(),
});

const webhookRecipientSchema = v.object({
	id: v.string(),
});

const messengerWebhookEventSchema = v.looseObject({
	recipient: webhookRecipientSchema,
	sender: webhookSenderSchema,
	timestamp: v.number(),
});

const messengerWebhookEntrySchema = v.object({
	id: v.string(),
	// Meta also sends delivery/read entries without `messaging`.
	messaging: v.optional(v.array(messengerWebhookEventSchema), []),
	time: v.number(),
});

export const messengerWebhookPayloadSchema = v.object({
	entry: v.array(messengerWebhookEntrySchema),
	object: v.literal("page"),
});

export type MessengerWebhookPayload = v.InferOutput<typeof messengerWebhookPayloadSchema>;
