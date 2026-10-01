import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import { type CodemodeJson, parseCodemodeWireText, toCodemodeJson } from "./codemode-boundary";
import { extractJsonObject, type InboundImage } from "./photo";
import {
	type PurchaseInvoiceExtraction,
	type PurchaseProvider,
	purchaseInvoiceExtractionSchema,
	purchaseProviderSchema,
} from "./purchase-invoice-schema";

export type ExtractDeps = {
	loadImage: (imageKey: string) => Promise<InboundImage | undefined>;
	runVision: (image: InboundImage, prompt: string) => Promise<string>;
};

const loadVisionParts = async (deps: ExtractDeps, imageKeys: Array<string>, prompt: string) => {
	const visionParts: Array<string> = [];
	for (const imageKey of imageKeys) {
		const image = await deps.loadImage(imageKey);
		if (image === undefined) {
			return {
				error: toCodemodeJson({ error: `Image no longer available: ${imageKey}`, ok: false }),
			};
		}
		visionParts.push(await deps.runVision(image, prompt));
	}
	return { visionParts };
};

const purchaseInvoiceVisionPrompt = (provider: string) =>
	`You are extracting purchase invoice data from screenshot image(s) for provider "${provider}".
Reply with ONLY a JSON object (no markdown) matching this shape:
{
  "header": {
    "externalOrderNumber": string | null,
    "orderedAt": string | null,
    "trackingNumber": string | null,
    "shippingCost": number | null,
    "notes": string | null,
    "subtotal": number | null,
    "total": number | null
  },
  "items": [{
    "sourceCode": string | null,
    "description": string,
    "quantity": number,
    "unitPrice": number | null,
    "lineTotal": number | null,
    "expirationDate": string | null,
    "brand": string | null,
    "amount": string | null,
    "potency": string | null,
    "categoryGuess": string | null,
    "name_mn": string | null,
    "descriptionDraft": string | null,
    "warnings": string[]
  }],
  "extractionStatus": "success" | "partial" | "failed",
  "errors": string[],
  "rawText": string | null
}
Read every visible line item. If unreadable, set extractionStatus to "partial" or "failed" and explain in errors.`;

export const buildPurchaseImageExtractTool = (
	deps: ExtractDeps & {
		matchExtracted: (input: {
			extraction: PurchaseInvoiceExtraction;
			provider: PurchaseProvider;
		}) => Promise<CodemodeJson>;
	},
) =>
	tool({
		description:
			"Extract a supplier invoice from admin-sent screenshot(s) using Workers AI vision on the agent, then match line items to the catalog. Call when dispatch input includes imageKeys (Telegram photos). Pass provider (amazon/iherb/naturebell/unknown) and the imageKeys array from the dispatch payload.",
		execute: async ({ imageKeys, provider }) => {
			const loaded = await loadVisionParts(deps, imageKeys, purchaseInvoiceVisionPrompt(provider));
			if ("error" in loaded) {
				return loaded.error;
			}
			const rawVision = loaded.visionParts.join("\n");
			const rawJson = extractJsonObject(rawVision);
			if (rawJson === undefined) {
				return toCodemodeJson({
					error: "Vision model did not return parseable invoice JSON.",
					ok: false,
					rawVision: rawVision.slice(0, 2000),
				});
			}

			let extraction: PurchaseInvoiceExtraction;
			try {
				extraction = v.parse(purchaseInvoiceExtractionSchema, JSON.parse(rawJson));
			} catch {
				return toCodemodeJson({
					error: "Vision JSON parse failed.",
					ok: false,
					rawVision: rawVision.slice(0, 2000),
				});
			}

			const matched = await deps.matchExtracted({ extraction, provider });
			return toCodemodeJson({ ok: true, result: matched });
		},
		inputSchema: valibotSchema(
			v.object({
				imageKeys: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
				provider: purchaseProviderSchema,
			}),
		),
	});

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

export const buildChatOrderImageExtractTool = (deps: ExtractDeps) =>
	tool({
		description:
			"Extract phone, address, notes, and product lines from a Facebook Messenger customer-chat screenshot. Call when imageKeys show a chat thread for creating a store order (not a supplier invoice). Pass the imageKeys from the dispatch payload.",
		execute: async ({ imageKeys }) => {
			const loaded = await loadVisionParts(deps, imageKeys, chatOrderVisionPrompt);
			if ("error" in loaded) {
				return loaded.error;
			}
			const rawVision = loaded.visionParts.join("\n");
			const rawJson = extractJsonObject(rawVision);
			if (rawJson === undefined) {
				return toCodemodeJson({
					error: "Vision model did not return parseable chat-order JSON.",
					ok: false,
					rawVision: rawVision.slice(0, 2000),
				});
			}

			try {
				const extraction = parseCodemodeWireText(rawJson);
				return toCodemodeJson({ extraction, ok: true });
			} catch {
				return toCodemodeJson({
					error: "Vision JSON parse failed.",
					ok: false,
					rawVision: rawVision.slice(0, 2000),
				});
			}
		},
		inputSchema: valibotSchema(
			v.object({
				imageKeys: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
			}),
		),
	});
