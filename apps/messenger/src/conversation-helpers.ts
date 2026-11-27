import type { ImagePart, ModelMessage, TextPart } from "ai";
import * as v from "valibot";

import { phonesInText } from "./cart";
import type { InboxRow } from "./conversation-store";
import type { Env } from "./env";
import { fetchImageParts } from "./photos";
import { paymentToolOutputSchema, type PaymentAction } from "./tools";
import type { ListedMessage } from "./zernio";

export const attachmentSchema = v.looseObject({
	type: v.string(),
	url: v.optional(v.nullable(v.string())),
});
export const pendingAttachmentsSchema = v.array(attachmentSchema);
export type AttachmentItem = v.InferOutput<typeof attachmentSchema>;

export const inboundItemSchema = v.looseObject({
	attachments: v.optional(v.array(attachmentSchema)),
	id: v.string(),
	raw: v.optional(v.unknown()),
	text: v.string(),
});
export const inboundItemsSchema = v.array(inboundItemSchema);
export type InboundItem = v.InferOutput<typeof inboundItemSchema>;

export const inboundRawSchema = v.looseObject({
	id: v.optional(v.string()),
	metadata: v.optional(
		v.nullable(
			v.looseObject({
				postbackPayload: v.optional(v.string()),
				quickReplyPayload: v.optional(v.string()),
				referral: v.optional(v.nullable(v.looseObject({ ad_id: v.optional(v.string()) }))),
			}),
		),
	),
	platformMessageId: v.optional(v.string()),
});

const AUTO_GREET_RE = /Bid tanii asuultand udahgui|Tanid yuugaar tuslah/i;
const SEED_ZERNIO_LIMIT = 20;

const isStickerAttachment = (a: { type: string; url?: null | string }): boolean => {
	if (a.type === "sticker") {
		return true;
	}
	if (a.type !== "image" || !a.url) {
		return false;
	}
	try {
		return new URL(a.url).pathname.includes("/t39.1997-6/");
	} catch {
		return a.url.includes("/t39.1997-6/");
	}
};

export const normalizeInboundItem = (item: InboundItem): InboundItem => {
	const attachments = item.attachments ?? [];
	const hasSticker = attachments.some(isStickerAttachment);
	if (!hasSticker) {
		return item;
	}
	const parts = [item.text, "[стикер]"];
	return {
		...item,
		attachments: attachments.filter((a) => !isStickerAttachment(a)),
		text: parts.filter((t) => t.length > 0).join("\n"),
	};
};

export type ClaimedSegment =
	| { kind: "dead"; row: InboxRow }
	| { kind: "live"; row: InboxRow }
	| { kind: "replay"; rows: Array<InboxRow>; turnId: string };

export const segmentClaimed = (
	rows: Array<InboxRow>,
	cutoff: number,
	maxAttempts: number,
): Array<ClaimedSegment> => {
	const segments: Array<ClaimedSegment> = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		if (row === undefined) {
			continue;
		}
		if (row.attempts >= maxAttempts || row.at < cutoff) {
			segments.push({ kind: "dead", row });
			continue;
		}
		if (row.turn_id !== null) {
			const turnId = row.turn_id;
			const group: Array<InboxRow> = [row];
			while (rows[i + 1]?.turn_id === turnId) {
				i++;
				const next = rows[i];
				if (next !== undefined) {
					group.push(next);
				}
			}
			segments.push({ kind: "replay", rows: group, turnId });
			continue;
		}
		segments.push({ kind: "live", row });
	}
	return segments;
};

export const lastToolCallInput = <T>(
	steps: Array<{ toolCalls: Array<{ input: unknown; toolName: string }> }>,
	name: string,
	schema: v.GenericSchema<unknown, T>,
): T | undefined => {
	for (const step of [...steps].reverse()) {
		for (const call of [...step.toolCalls].reverse()) {
			if (call.toolName === name) {
				const parsed = v.safeParse(schema, call.input);
				if (parsed.success) {
					return parsed.output;
				}
			}
		}
	}
	return undefined;
};

export const extractPaymentAction = (
	steps: Array<{ toolResults: Array<{ output: unknown; toolName: string }> }>,
): PaymentAction | undefined => {
	for (const step of [...steps].reverse()) {
		for (const res of [...step.toolResults].reverse()) {
			if (res.toolName === "payment") {
				const parsed = v.safeParse(paymentToolOutputSchema, res.output);
				if (parsed.success && parsed.output.handled && parsed.output.action !== undefined) {
					return parsed.output.action;
				}
			}
		}
	}
	return undefined;
};

export const incomingPhones = (messages: Array<ListedMessage>): Array<string> => {
	const candidates: Array<string> = [];
	for (const message of messages) {
		if (message.direction !== "incoming" || message.message === undefined) {
			continue;
		}
		for (const phone of phonesInText(message.message)) {
			if (!candidates.includes(phone)) {
				candidates.push(phone);
			}
		}
		if (candidates.length >= 3) {
			break;
		}
	}
	return candidates.slice(0, 3);
};

export const toSeedModelMessages = (listed: Array<ListedMessage>): Array<ModelMessage> => {
	const out: Array<ModelMessage> = [];
	for (const m of [...listed].reverse()) {
		const rawText = m.message?.trim() ?? "";
		if (m.direction === "outgoing" && AUTO_GREET_RE.test(rawText)) {
			continue;
		}
		const hasAttachment = (m.attachments ?? []).length > 0;
		const text = rawText || (hasAttachment ? "[зураг]" : "");
		if (text.length === 0) {
			continue;
		}
		if (m.direction === "incoming") {
			out.push({ content: [{ text: text.slice(0, 500), type: "text" }], role: "user" });
		} else if (m.direction === "outgoing") {
			out.push({ content: [{ text: text.slice(0, 500), type: "text" }], role: "assistant" });
		}
	}
	return out.slice(-SEED_ZERNIO_LIMIT);
};

export const buildUserMessages = async (
	env: Env,
	items: Array<InboundItem>,
): Promise<{
	firstPhotoUrl: string | undefined;
	hadPhotos: boolean;
	persistedUserMessage: ModelMessage;
	photoCount: number;
	text: string;
	userMessage: ModelMessage;
}> => {
	const text = items
		.map((i) => i.text)
		.filter((t) => t.length > 0)
		.join("\n");
	const firstPhotoUrl =
		items
			.flatMap((i) => i.attachments ?? [])
			.find((a) => a.type === "image" && a.url !== undefined && a.url !== null && a.url.length > 0)
			?.url ?? undefined;
	const imageParts = (
		await Promise.all(items.map((i) => fetchImageParts(env, i.attachments ?? [])))
	).flat();
	const userParts: Array<ImagePart | TextPart> = [
		...(text.length > 0 ? [{ text, type: "text" as const }] : []),
		...imageParts,
	];
	return {
		firstPhotoUrl,
		hadPhotos: firstPhotoUrl !== undefined,
		persistedUserMessage: {
			content: userParts.map((part) =>
				part.type === "image" ? { text: "[зураг]", type: "text" as const } : part,
			),
			role: "user",
		},
		photoCount: imageParts.length,
		text,
		userMessage: { content: userParts, role: "user" },
	};
};

export const turnIdFor = async (rows: Array<InboxRow>): Promise<string> => {
	const ids = rows
		.map((r) => r.event_id)
		.sort()
		.join(",");
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ids));
	const hex = Array.from(new Uint8Array(digest).slice(0, 6), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");
	return `t_${hex}`;
};

export const messageText = (message: ModelMessage): string => {
	if (!Array.isArray(message.content)) {
		return message.content;
	}
	return message.content
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join(" ");
};
