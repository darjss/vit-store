/**
 * Stock at or below this shows the low-stock warning badge.
 * Single source of truth shared by the catalog card, SSR cards, home shelf,
 * search result row, and PDP so stock labels stay consistent across surfaces.
 */
export const LOW_STOCK_THRESHOLD = 5;

export type StockState = "out" | "low" | "in";

/**
 * Classify a product's stock count into a canonical state used by every
 * product surface. `stock === 0` is out of stock; `0 < stock <= threshold` is
 * low; anything above the threshold (or unknown stock) is in stock.
 */
export const productStockState = (stock?: number): StockState => {
	if (stock === 0) return "out";
	if (stock !== undefined && stock > 0 && stock <= LOW_STOCK_THRESHOLD) {
		return "low";
	}
	return "in";
};
