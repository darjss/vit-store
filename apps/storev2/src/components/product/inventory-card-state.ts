import { LOW_STOCK_THRESHOLD } from "@vit/shared/domain/product";

export type InventoryCardState = "checking" | "degraded" | "in" | "low" | "out";

export interface InventoryCardPresentation {
	state: InventoryCardState;
	availabilityLabel: string;
	verified: boolean;
}

export const unverifiedInventoryCardPresentation = (
	status: "checking" | "degraded",
): InventoryCardPresentation => ({
	state: status,
	availabilityLabel:
		status === "checking" ? "Нөөц шалгаж байна" : "Нөөц баталгаажаагүй",
	verified: false,
});

export const verifiedInventoryCardPresentation = (snapshot: {
	stock: number;
	status: string;
}): InventoryCardPresentation => {
	const inStock = snapshot.status === "active" && snapshot.stock > 0;
	if (!inStock) {
		return { state: "out", availabilityLabel: "Дууссан", verified: true };
	}
	if (snapshot.stock <= LOW_STOCK_THRESHOLD) {
		return {
			state: "low",
			availabilityLabel: `Цөөхөн үлдсэн (${snapshot.stock})`,
			verified: true,
		};
	}
	return { state: "in", availabilityLabel: "Бэлэн байна", verified: true };
};
