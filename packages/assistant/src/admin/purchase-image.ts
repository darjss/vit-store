import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import type { InboundImage } from "../photo";
import { extractJsonObject } from "../photo";

export const PURCHASE_IMAGE_EXTRACT_TOOL_NAME = "extract_purchase_from_image_keys";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const asJson = (value: unknown): Json =>
	JSON.parse(JSON.stringify(value)) as Json;

const purchaseProvider = ["amazon", "iherb", "naturebell", "unknown"] as const;

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
	runVision: (image: InboundImage, prompt: string) => Promise<string>;
	matchExtracted: (input: {
		provider: (typeof purchaseProvider)[number];
		extraction: Record<string, unknown>;
	}) => Promise<unknown>;
};

export const buildPurchaseImageExtractTool = (deps: PurchaseImageExtractDeps) =>
	defineTool({
		name: PURCHASE_IMAGE_EXTRACT_TOOL_NAME,
		description:
			"Extract a supplier invoice from admin-sent screenshot(s) using Workers AI vision on the agent, then match line items to the catalog. Call when dispatch input includes imageKeys (Telegram/Messenger photos). Pass provider (amazon/iherb/naturebell/unknown) and the imageKeys array from the dispatch payload.",
		input: v.object({
			provider: v.picklist(purchaseProvider),
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
				const text = await deps.runVision(
					image,
					purchaseInvoiceVisionPrompt(input.provider),
				);
				visionParts.push(text);
			}

			const rawJson = extractJsonObject(visionParts.join("\n"));
			if (rawJson === undefined) {
				return asJson({
					ok: false,
					error: "Vision model did not return parseable invoice JSON.",
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}

			let extraction: Record<string, unknown>;
			try {
				extraction = JSON.parse(rawJson) as Record<string, unknown>;
			} catch {
				return asJson({
					ok: false,
					error: "Vision JSON parse failed.",
					rawVision: visionParts.join("\n").slice(0, 2000),
				});
			}

			const matched = await deps.matchExtracted({
				provider: input.provider,
				extraction,
			});
			return asJson({ ok: true, result: matched });
		},
	});
