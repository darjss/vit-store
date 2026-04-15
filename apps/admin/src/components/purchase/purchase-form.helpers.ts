import type {
	AIPurchaseMatchedProduct,
	AIPurchaseProductDraft,
} from "@vit/shared";
import type { PurchaseDetailType, RouterInputs, RouterOutputs } from "@/lib/types";

export type PurchaseFormProps = {
	purchase?: PurchaseDetailType;
	aiData?: RouterOutputs["aiPurchase"]["extractPurchaseFromImages"];
	onSuccess?: (purchaseId: number) => void;
	onResetAI?: () => void;
};

export type PurchaseLineState = {
	id?: number;
	productId: number;
	quantityOrdered: number;
	unitCost: number;
	quantityReceived?: number;
	sourceCode?: string | null;
	description?: string;
	lineTotal?: number | null;
	expirationDate?: string | null;
	warnings?: string[];
	candidateMatches?: AIPurchaseMatchedProduct[];
	newProductDraft?: AIPurchaseProductDraft | null;
};

export const EMPTY_LINE: PurchaseLineState = {
	productId: 0,
	quantityOrdered: 1,
	unitCost: 0,
	sourceCode: null,
	description: "",
	lineTotal: null,
	expirationDate: null,
	warnings: [],
	newProductDraft: null,
};

export function toDateInputValue(date: Date | null | undefined) {
	if (!date) return "";
	const value = new Date(date);
	const timezoneOffset = value.getTimezoneOffset() * 60000;
	return new Date(value.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function createLineFromAIItem(
	item: NonNullable<PurchaseFormProps["aiData"]>["items"][number],
): PurchaseLineState {
	return {
		productId: item.productId ?? 0,
		quantityOrdered: item.quantity,
		unitCost: item.unitPrice,
		sourceCode: item.sourceCode ?? null,
		description: item.description,
		lineTotal: item.lineTotal ?? null,
		expirationDate: item.expirationDate ?? null,
		warnings: item.warnings ?? [],
		candidateMatches: item.candidateMatches ?? [],
		newProductDraft: item.newProductDraft ?? null,
	};
}

export function createLineFromPurchaseItem(
	item: PurchaseDetailType["items"][number],
): PurchaseLineState {
	return {
		id: item.id,
		productId: item.productId,
		quantityOrdered: item.quantityOrdered,
		unitCost: item.unitCost,
		quantityReceived: item.quantityReceived,
		sourceCode: null,
		description: item.product.name,
		lineTotal: item.lineTotal,
		expirationDate: null,
		warnings: [],
		newProductDraft: null,
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

export function hasUnresolvedAiItems(items: PurchaseLineState[]) {
	return items.some((item) => {
		if (item.productId > 0) return false;
		const draft = item.newProductDraft;
		return (
			!draft?.name ||
			!draft.amount ||
			!draft.potency ||
			!draft.brandId ||
			!draft.categoryId
		);
	});
}

export function buildAiDraft(
	item: PurchaseLineState,
): NonNullable<RouterInputs["aiPurchase"]["saveExtractedPurchase"]["items"][number]["newProductDraft"]> {
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
		provider: PurchaseDetailType["provider"];
		externalOrderNumber: string;
		trackingNumber: string;
		shippingCost: number;
		notes: string;
		orderedAt: string;
		shippedAt: string;
		forwarderReceivedAt: string;
	},
	items: PurchaseLineState[],
): RouterInputs["aiPurchase"]["saveExtractedPurchase"] {
	return {
		provider: values.provider,
		externalOrderNumber: values.externalOrderNumber,
		trackingNumber: values.trackingNumber || null,
		shippingCost: Number(values.shippingCost) || 0,
		notes: values.notes || null,
		orderedAt: values.orderedAt ? new Date(values.orderedAt) : null,
		shippedAt: values.shippedAt ? new Date(values.shippedAt) : null,
		forwarderReceivedAt: values.forwarderReceivedAt
			? new Date(values.forwarderReceivedAt)
			: null,
		items: items.map((item) => ({
			sourceCode: item.sourceCode ?? null,
			description: item.description || "",
			quantity: Number(item.quantityOrdered),
			unitPrice: Number(item.unitCost),
			lineTotal:
				item.lineTotal ?? Number(item.quantityOrdered) * Number(item.unitCost),
			expirationDate: item.expirationDate ?? null,
			matchStatus: item.productId > 0 ? "matched" : "unmatched",
			productId: item.productId > 0 ? item.productId : null,
			matchedProduct: item.productId > 0 ? undefined : null,
			candidateMatches: item.candidateMatches ?? [],
			newProductDraft: item.productId > 0 ? null : buildAiDraft(item),
			warnings: item.warnings ?? [],
		})),
	};
}

export function buildPurchasePayload(
	values: {
		provider: PurchaseDetailType["provider"];
		externalOrderNumber: string;
		trackingNumber: string;
		shippingCost: number;
		notes: string;
		orderedAt: string;
		shippedAt: string;
		forwarderReceivedAt: string;
		receivedAt?: Date | null;
		cancelledAt?: Date | null;
	},
	items: PurchaseLineState[],
){
	return {
		provider: values.provider,
		externalOrderNumber: values.externalOrderNumber,
		trackingNumber: values.trackingNumber || null,
		shippingCost: Number(values.shippingCost) || 0,
		notes: values.notes || null,
		orderedAt: values.orderedAt ? new Date(values.orderedAt) : null,
		shippedAt: values.shippedAt ? new Date(values.shippedAt) : null,
		forwarderReceivedAt: values.forwarderReceivedAt
			? new Date(values.forwarderReceivedAt)
			: null,
		receivedAt: values.receivedAt ?? null,
		cancelledAt: values.cancelledAt ?? null,
		items: items.map((item) => ({
			id: item.id,
			productId: Number(item.productId),
			quantityOrdered: Number(item.quantityOrdered),
			unitCost: Number(item.unitCost),
		})),
	};
}
