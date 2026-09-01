import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import type { InboundImage } from "../photo";
import { extractJsonObject } from "../photo";
import { type CodemodeJson, toCodemodeJson } from "./codemode-boundary";
import {
	type PurchaseInvoiceExtraction,
	type PurchaseProvider,
	purchaseInvoiceExtractionSchema,
	purchaseProviderSchema,
} from "./purchase-invoice-schema";

export const PURCHASE_IMAGE_EXTRACT_TOOL_NAME = "extract_purchase_from_image_keys";

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

export type PurchaseImageExtractDeps = {
	loadImage: (imageKey: string) => Promise<InboundImage | undefined>;
	matchExtracted: (input: {
		extraction: PurchaseInvoiceExtraction;
		provider: PurchaseProvider;
	}) => Promise<CodemodeJson>;
	runVision: (image: InboundImage, prompt: string) => Promise<string>;
};

export const buildPurchaseImageExtractTool = (deps: PurchaseImageExtractDeps) =>
	defineTool({
		description:
			"Extract a supplier invoice from admin-sent screenshot(s) using Workers AI vision on the agent, then match line items to the catalog. Call when dispatch input includes imageKeys (Telegram/Messenger photos). Pass provider (amazon/iherb/naturebell/unknown) and the imageKeys array from the dispatch payload.",
		input: v.object({
			imageKeys: v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.minLength(1)),
			provider: purchaseProviderSchema,
		}),
		name: PURCHASE_IMAGE_EXTRACT_TOOL_NAME,
		async run({ input }) {
			const visionParts: Array<string> = [];
			for (const imageKey of input.imageKeys) {
				const image = await deps.loadImage(imageKey);
				if (image === undefined) {
					return toCodemodeJson({
						error: `Image no longer available: ${imageKey}`,
						ok: false,
					});
				}
				const text = await deps.runVision(image, purchaseInvoiceVisionPrompt(input.provider));
				visionParts.push(text);
			}

			const rawJson = extractJsonObject(visionParts.join("\n"));
			if (rawJson === undefined) {
				return toCodemodeJson({
					error: "Vision model did not return parseable invoice JSON.",
					ok: false,
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}

			let extraction: PurchaseInvoiceExtraction;
			try {
				extraction = v.parse(purchaseInvoiceExtractionSchema, JSON.parse(rawJson));
			} catch {
				return toCodemodeJson({
					error: "Vision JSON parse failed.",
					ok: false,
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}

			const matched = await deps.matchExtracted({
				extraction,
				provider: input.provider,
			});
			return toCodemodeJson({ ok: true, result: matched });
		},
	});
