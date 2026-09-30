import * as v from "valibot";

const graphButtonSchema = v.object({
	payload: v.optional(v.string()),
	title: v.optional(v.string()),
	type: v.optional(v.string()),
	url: v.optional(v.string()),
});

const graphQuickReplySchema = v.object({
	payload: v.optional(v.string()),
	title: v.optional(v.string()),
});

const graphAttachmentSchema = v.object({
	payload: v.optional(
		v.object({
			buttons: v.optional(v.array(graphButtonSchema)),
			elements: v.optional(
				v.array(
					v.object({
						buttons: v.optional(v.array(graphButtonSchema)),
					}),
				),
			),
			template_type: v.optional(v.string()),
		}),
	),
	type: v.optional(v.string()),
});

export const graphSendBodySchema = v.object({
	message: v.optional(
		v.object({
			attachment: v.optional(graphAttachmentSchema),
			quick_replies: v.optional(v.array(graphQuickReplySchema)),
			text: v.optional(v.string()),
		}),
	),
	recipient: v.optional(
		v.object({
			id: v.optional(v.union([v.string(), v.number()])),
		}),
	),
	sender_action: v.optional(v.string()),
});

export type GraphSendBody = v.InferOutput<typeof graphSendBodySchema>;

export type DevButton = {
	kind: "postback" | "quick_reply" | "url";
	title: string;
	value: string;
};

export function extractGraphButtons(message: GraphSendBody["message"]): Array<DevButton> {
	const buttons: Array<DevButton> = [];
	for (const qr of message?.quick_replies ?? []) {
		const title = qr.title ?? "";
		const payload = qr.payload;
		if (payload) {
			buttons.push({ kind: "quick_reply", title, value: payload });
		}
	}
	const payload = message?.attachment?.payload;
	const collect = (btns: Array<v.InferOutput<typeof graphButtonSchema>> | undefined) => {
		for (const btn of btns ?? []) {
			const title = btn.title ?? "";
			if (btn.type === "postback" && btn.payload) {
				buttons.push({ kind: "postback", title, value: btn.payload });
			} else if (btn.type === "web_url" && btn.url) {
				buttons.push({ kind: "url", title, value: btn.url });
			}
		}
	};
	if (payload) {
		collect(payload.buttons);
		for (const el of payload.elements ?? []) {
			collect(el.buttons);
		}
	}
	return buttons;
}

export type GraphCapture = {
	attachment?: string;
	buttons: Array<string>;
	quickReplies: Array<string>;
	text?: string;
};

export function captureGraphSend(body: GraphSendBody): GraphCapture | undefined {
	if (body.sender_action) {
		return undefined;
	}
	const message = body.message;
	const quickReplies = (message?.quick_replies ?? []).map((q) => String(q.payload ?? ""));
	const attachment = message?.attachment;
	const payload = attachment?.payload;
	const buttons: Array<string> = [];
	const collect = (btns: Array<v.InferOutput<typeof graphButtonSchema>> | undefined) => {
		for (const btn of btns ?? []) {
			if (btn.type === "postback" && btn.payload) {
				buttons.push(`${btn.title ?? ""} → ${btn.payload}`);
			} else if (btn.type === "web_url" && btn.url) {
				buttons.push(`${btn.title ?? ""} → ${btn.url}`);
			}
		}
	};
	if (payload) {
		collect(payload.buttons);
		for (const el of payload.elements ?? []) {
			collect(el.buttons);
		}
	}
	return {
		attachment: attachment
			? `${String(attachment.type ?? "")} ${String(payload?.template_type ?? "")}`
			: undefined,
		buttons,
		quickReplies,
		text: message?.text,
	};
}
