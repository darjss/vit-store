export function calcConversionRate(views: number, addToCartCount: number): string {
	return views > 0 ? ((addToCartCount / views) * 100).toFixed(1) : "0";
}
