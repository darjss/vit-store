import type { AIPurchaseMatchedProduct, AIPurchaseProductDraft } from "@vit/shared";
import type { PurchaseDetailType, RouterInputs, RouterOutputs } from "@/lib/types";

export type PurchaseFormProps = {
	aiData?: RouterOutputs["aiPurchase"]["extractPurchaseFromImages"];
	onResetAI?: () => void;
	onSuccess?: (purchaseId: number) => void;
	purchase?: PurchaseDetailType;
};

export type PurchaseLineState = {
	candidateMatches?: Array<AIPurchaseMatchedProduct>;
	description?: string;
	expirationDate?: string | null;
	id?: number;
	lineTotal?: number | null;
	newProductDraft?: AIPurchaseProductDraft | null;
	productId: number;
	quantityOrdered: number;
	quantityReceived?: number;
	sourceCode?: string | null;
	unitCost: number;
	warnings?: Array<string>;
};

export const EMPTY_LINE: PurchaseLineState = {
	description: "",
	expirationDate: null,
	lineTotal: null,
	newProductDraft: null,
	productId: 0,
	quantityOrdered: 1,
	sourceCode: null,
	unitCost: 0,
	warnings: [],
};

export function toDateInputValue(date: Date | null | undefined) {
	if (!date) {
		return "";
	}
	const value = new Date(date);
	const timezoneOffset = value.getTimezoneOffset() * 60_000;
	return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function createLineFromAIItem(
	item: NonNullable<PurchaseFormProps["aiData"]>["items"][number],
): PurchaseLineState {
	return {
		candidateMatches: item.candidateMatches ?? [],
		description: item.description,
		expirationDate: item.expirationDate ?? null,
		lineTotal: item.lineTotal ?? null,
		newProductDraft: item.newProductDraft ?? null,
		productId: item.productId ?? 0,
		quantityOrdered: item.quantity,
		sourceCode: item.sourceCode ?? null,
		unitCost: item.unitPrice,
		warnings: item.warnings ?? [],
	};
}

function createLineFromPurchaseItem(item: PurchaseDetailType["items"][number]): PurchaseLineState {
	return {
		description: item.product.name,
		expirationDate: null,
		id: item.id,
		lineTotal: item.lineTotal,
		newProductDraft: null,
		productId: item.productId,
		quantityOrdered: item.quantityOrdered,
		quantityReceived: item.quantityReceived,
		sourceCode: null,
		unitCost: item.unitCost,
		warnings: [],
	};
}

export function getInitialPurchaseItems({
	aiData,
	purchase,
}: Pick<PurchaseFormProps, "aiData" | "purchase">) {
	if (aiData?.items.length) {
		return aiData.items.map(createLineFromAIItem);
	}

	if (purchase?.items.length) {
		return purchase.items.map(createLineFromPurchaseItem);
	}

	return [{ ...EMPTY_LINE }];
}

export function hasUnresolvedAiItems(items: Array<PurchaseLineState>) {
	return items.some((item) => {
		if (item.productId > 0) {
			return false;
		}
		const draft = item.newProductDraft;
		return !draft?.name || !draft.amount || !draft.potency || !draft.brandId || !draft.categoryId;
	});
}

function buildAiDraft(
	item: PurchaseLineState,
): NonNullable<
	RouterInputs["aiPurchase"]["saveExtractedPurchase"]["items"][number]["newProductDraft"]
> {
	const draft = item.newProductDraft;

	if (!draft) {
		throw new Error("Missing draft for unmatched AI purchase line");
	}

	return {
		...draft,
		images: draft.images ?? [],
	};
}

export function buildImportedPurchasePayload(
	values: {
		externalOrderNumber: string;
		forwarderReceivedAt: string;
		notes: string;
		orderedAt: string;
		provider: PurchaseDetailType["provider"];
		shippedAt: string;
		shippingCost: number;
		trackingNumber: string;
	},
	items: Array<PurchaseLineState>,
): RouterInputs["aiPurchase"]["saveExtractedPurchase"] {
	return {
		externalOrderNumber: values.externalOrderNumber,
		forwarderReceivedAt: values.forwarderReceivedAt ? new Date(values.forwarderReceivedAt) : null,
		items: items.map((item) => ({
			candidateMatches: item.candidateMatches ?? [],
			description: item.description || "",
			expirationDate: item.expirationDate ?? null,
			lineTotal: item.lineTotal ?? Number(item.quantityOrdered) * Number(item.unitCost),
			matchedProduct: item.productId > 0 ? undefined : null,
			matchStatus: item.productId > 0 ? "matched" : "unmatched",
			newProductDraft: item.productId > 0 ? null : buildAiDraft(item),
			productId: item.productId > 0 ? item.productId : null,
			quantity: Number(item.quantityOrdered),
			sourceCode: item.sourceCode ?? null,
			unitPrice: Number(item.unitCost),
			warnings: item.warnings ?? [],
		})),
		notes: values.notes || null,
		orderedAt: values.orderedAt ? new Date(values.orderedAt) : null,
		provider: values.provider,
		shippedAt: values.shippedAt ? new Date(values.shippedAt) : null,
		shippingCost: Number(values.shippingCost) || 0,
		trackingNumber: values.trackingNumber || null,
	};
}

export function buildPurchasePayload(
	values: {
		cancelledAt?: Date | null;
		externalOrderNumber: string;
		forwarderReceivedAt: string;
		notes: string;
		orderedAt: string;
		provider: PurchaseDetailType["provider"];
		receivedAt?: Date | null;
		shippedAt: string;
		shippingCost: number;
		trackingNumber: string;
	},
	items: Array<PurchaseLineState>,
) {
	return {
		cancelledAt: values.cancelledAt ?? null,
		externalOrderNumber: values.externalOrderNumber,
		forwarderReceivedAt: values.forwarderReceivedAt ? new Date(values.forwarderReceivedAt) : null,
		items: items.map((item) => ({
			id: item.id,
			productId: Number(item.productId),
			quantityOrdered: Number(item.quantityOrdered),
			unitCost: Number(item.unitCost),
		})),
		notes: values.notes || null,
		orderedAt: values.orderedAt ? new Date(values.orderedAt) : null,
		provider: values.provider,
		receivedAt: values.receivedAt ?? null,
		shippedAt: values.shippedAt ? new Date(values.shippedAt) : null,
		shippingCost: Number(values.shippingCost) || 0,
		trackingNumber: values.trackingNumber || null,
	};
}
