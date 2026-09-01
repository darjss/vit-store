import * as v from "valibot";

// Vision-model invoice JSON the admin purchase-image tool and
// `aiPurchase.matchExtractedInvoice` both operate on.
export const purchaseInvoiceExtractionSchema = v.object({
	errors: v.array(v.string()),
	extractionStatus: v.picklist(["success", "partial", "failed"]),
	header: v.object({
		externalOrderNumber: v.nullable(v.string()),
		notes: v.nullable(v.string()),
		orderedAt: v.nullable(v.string()),
		shippingCost: v.nullable(v.number()),
		subtotal: v.nullable(v.number()),
		total: v.nullable(v.number()),
		trackingNumber: v.nullable(v.string()),
	}),
	items: v.array(
		v.object({
			amount: v.nullable(v.string()),
			brand: v.nullable(v.string()),
			categoryGuess: v.nullable(v.string()),
			description: v.string(),
			descriptionDraft: v.nullable(v.string()),
			expirationDate: v.nullable(v.string()),
			lineTotal: v.nullable(v.number()),
			name_mn: v.nullable(v.string()),
			potency: v.nullable(v.string()),
			quantity: v.number(),
			sourceCode: v.nullable(v.string()),
			unitPrice: v.nullable(v.number()),
			warnings: v.array(v.string()),
		}),
	),
	rawText: v.nullable(v.string()),
});

export type PurchaseInvoiceExtraction = v.InferOutput<typeof purchaseInvoiceExtractionSchema>;

export const purchaseProviderSchema = v.picklist(["amazon", "iherb", "naturebell", "unknown"]);

export type PurchaseProvider = v.InferOutput<typeof purchaseProviderSchema>;
