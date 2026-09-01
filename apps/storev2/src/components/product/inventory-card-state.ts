import { LOW_STOCK_THRESHOLD } from "@vit/shared/domain/product";

export type InventoryCardState = "checking" | "degraded" | "in" | "low" | "out";

export interface InventoryCardPresentation {
	availabilityLabel: string;
	state: InventoryCardState;
	verified: boolean;
}

export const unverifiedInventoryCardPresentation = (
	status: "checking" | "degraded",
): InventoryCardPresentation => ({
	availabilityLabel: status === "checking" ? "Нөөц шалгаж байна" : "Нөөц баталгаажаагүй",
	state: status,
	verified: false,
});

export const verifiedInventoryCardPresentation = (snapshot: {
	status: string;
	stock: number;
}): InventoryCardPresentation => {
	const inStock = snapshot.status === "active" && snapshot.stock > 0;
	if (!inStock) {
		return { availabilityLabel: "Дууссан", state: "out", verified: true };
	}
	if (snapshot.stock <= LOW_STOCK_THRESHOLD) {
		return {
			availabilityLabel: "Цөөхөн үлдсэн",
			state: "low",
			verified: true,
		};
	}
	return { availabilityLabel: "Бэлэн байна", state: "in", verified: true };
};
