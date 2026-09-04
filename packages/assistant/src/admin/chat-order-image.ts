import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import type { InboundImage } from "../photo";
import { extractJsonObject } from "../photo";

export const CHAT_ORDER_IMAGE_EXTRACT_TOOL_NAME =
	"extract_order_from_chat_image_keys";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const asJson = (value: unknown): Json =>
	JSON.parse(JSON.stringify(value)) as Json;

const chatOrderVisionPrompt = `You are reading a Facebook Messenger (or similar chat) screenshot of a customer placing an order with a vitamin shop admin.
Reply with ONLY a JSON object (no markdown):
{
  "customerPhone": string | null,
  "address": string | null,
  "notes": string | null,
  "products": [{
    "description": string,
    "quantity": number,
    "unitPrice": number | null,
    "brand": string | null
  }],
  "paymentHint": "paid" | "unpaid" | "unknown",
  "customerName": string | null,
  "rawText": string | null,
  "extractionStatus": "success" | "partial" | "failed",
  "errors": string[]
}
Extract every product the customer wants to buy and any phone/address/notes visible in the thread. Mongolian or romanized text is fine. If unreadable, use partial/failed and explain in errors.`;

export type ChatOrderImageExtractDeps = {
	loadImage: (imageKey: string) => Promise<InboundImage | undefined>;
	runVision: (image: InboundImage, prompt: string) => Promise<string>;
};

export const buildChatOrderImageExtractTool = (
	deps: ChatOrderImageExtractDeps,
) =>
	defineTool({
		name: CHAT_ORDER_IMAGE_EXTRACT_TOOL_NAME,
		description:
			"Extract phone, address, notes, and product lines from a Facebook Messenger customer-chat screenshot. Call when imageKeys show a chat thread for creating a store order (not a supplier invoice). Pass the imageKeys from the dispatch payload.",
		input: v.object({
			imageKeys: v.pipe(
				v.array(v.pipe(v.string(), v.minLength(1))),
				v.minLength(1),
			),
		}),
		async run({ input }) {
			const visionParts: string[] = [];
			for (const imageKey of input.imageKeys) {
				const image = await deps.loadImage(imageKey);
				if (image === undefined) {
					return asJson({
						ok: false,
						error: `Image no longer available: ${imageKey}`,
					});
				}
				const text = await deps.runVision(image, chatOrderVisionPrompt);
				visionParts.push(text);
			}

			const rawJson = extractJsonObject(visionParts.join("\n"));
			if (rawJson === undefined) {
				return asJson({
					ok: false,
					error: "Vision model did not return parseable chat-order JSON.",
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}

			try {
				const extraction = JSON.parse(rawJson) as Record<string, unknown>;
				return asJson({ ok: true, extraction });
			} catch {
				return asJson({
					ok: false,
					error: "Vision JSON parse failed.",
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}
		},
	});
