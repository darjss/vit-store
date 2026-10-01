import * as v from "valibot";

const zernioButtonSchema = v.object({
	payload: v.optional(v.string()),
	title: v.optional(v.string()),
	type: v.optional(v.string()),
	url: v.optional(v.string()),
});

const zernioQuickReplySchema = v.object({
	payload: v.optional(v.string()),
	title: v.optional(v.string()),
});

const zernioTemplateElementSchema = v.object({
	buttons: v.optional(v.array(zernioButtonSchema)),
	imageUrl: v.optional(v.string()),
	subtitle: v.optional(v.string()),
	title: v.optional(v.string()),
});

export const zernioSendBodySchema = v.looseObject({
	accountId: v.optional(v.string()),
	buttons: v.optional(v.array(zernioButtonSchema)),
	message: v.optional(v.string()),
	quickReplies: v.optional(v.array(zernioQuickReplySchema)),
	template: v.optional(
		v.looseObject({
			elements: v.optional(v.array(zernioTemplateElementSchema)),
			type: v.optional(v.string()),
		}),
	),
});

export type ZernioSendBody = v.InferOutput<typeof zernioSendBodySchema>;

export type DevButton = {
	kind: "postback" | "quick_reply" | "url";
	title: string;
	value: string;
};

export function extractZernioButtons(body: ZernioSendBody): Array<DevButton> {
	const buttons: Array<DevButton> = [];
	for (const qr of body.quickReplies ?? []) {
		const title = qr.title ?? "";
		const payload = qr.payload;
		if (payload) {
			buttons.push({ kind: "quick_reply", title, value: payload });
		}
	}
	const collect = (btns: Array<v.InferOutput<typeof zernioButtonSchema>> | undefined) => {
		for (const btn of btns ?? []) {
			const title = btn.title ?? "";
			if (btn.type === "postback" && btn.payload) {
				buttons.push({ kind: "postback", title, value: btn.payload });
			} else if (btn.type === "url" && btn.url) {
				buttons.push({ kind: "url", title, value: btn.url });
			}
		}
	};
	collect(body.buttons);
	for (const el of body.template?.elements ?? []) {
		collect(el.buttons);
	}
	return buttons;
}

export type ZernioCapture = {
	attachment?: string;
	buttons: Array<string>;
	quickReplies: Array<string>;
	text?: string;
};

export function captureZernioSend(body: ZernioSendBody): ZernioCapture {
	const quickReplies = (body.quickReplies ?? []).map((q) => String(q.payload ?? ""));
	const buttons: Array<string> = [];
	const collect = (btns: Array<v.InferOutput<typeof zernioButtonSchema>> | undefined) => {
		for (const btn of btns ?? []) {
			if (btn.type === "postback" && btn.payload) {
				buttons.push(`${btn.title ?? ""} → ${btn.payload}`);
			} else if (btn.type === "url" && btn.url) {
				buttons.push(`${btn.title ?? ""} → ${btn.url}`);
			}
		}
	};
	collect(body.buttons);
	for (const el of body.template?.elements ?? []) {
		collect(el.buttons);
	}
	return {
		attachment: body.template ? `template ${String(body.template.type ?? "")}` : undefined,
		buttons,
		quickReplies,
		text: body.message,
	};
}

// The inbound `message.received` envelope the dev CLIs sign and POST to the
// worker's webhook. Mirrors the fields apps/agent/src/channels/messenger.ts
// parses from a real Zernio delivery.
export type ZernioInboundEvent = {
	account: { id: string };
	conversation: { id: string; platformConversationId: string };
	event: "message.received";
	id: string;
	message: {
		attachments?: Array<{ type: string; url: string }>;
		direction: "incoming";
		id: string;
		platform: "facebook";
		platformMessageId: string;
		sender: { id: string };
		sentAt: string;
		text: string | null;
	};
	metadata: { postbackPayload?: string; quickReplyPayload?: string } | null;
	timestamp: string;
};

// Builds one inbound event. Button taps are modeled the way Zernio delivers
// them: a normal message.received carrying the payload in top-level metadata.
export function buildZernioInboundEvent(input: {
	accountId: string;
	attachments?: Array<{ type: string; url: string }>;
	conversationId: string;
	eventId: string;
	metadata?: { postbackPayload?: string; quickReplyPayload?: string };
	text?: string;
}): ZernioInboundEvent {
	const now = new Date().toISOString();
	const event: ZernioInboundEvent = {
		account: { id: input.accountId },
		conversation: {
			id: input.conversationId,
			platformConversationId: input.conversationId,
		},
		event: "message.received",
		id: input.eventId,
		message: {
			direction: "incoming",
			id: input.eventId,
			platform: "facebook",
			platformMessageId: input.eventId,
			sender: { id: input.conversationId },
			sentAt: now,
			text: input.text ?? null,
		},
		metadata: input.metadata ?? null,
		timestamp: now,
	};
	if (input.attachments) {
		event.message.attachments = input.attachments;
	}
	return event;
}
