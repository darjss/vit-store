/**
 * A product is on sale when it carries a compare-at price above what checkout
 * charges. Every badge, struck price and savings line reads this one helper.
 */
export const productSale = (product: { compareAtPrice?: number | null; price: number }) => {
	const { compareAtPrice, price } = product;
	if (!compareAtPrice || compareAtPrice <= price) {
		return null;
	}
	return {
		compareAtPrice,
		percent: Math.round((1 - price / compareAtPrice) * 100),
		saved: compareAtPrice - price,
	};
};

export type ProductSale = NonNullable<ReturnType<typeof productSale>>;

/**
 * The running storefront campaign. `productIds` sets the order on the campaign
 * page, best sellers first. The ops script in vit-playground writes the sale
 * prices for these ids at the start and restores them at the end.
 */
export const SALE_CAMPAIGN = {
	end: "2026-11-23T23:59:59+08:00",
	name: "Black Friday",
	path: "/black-friday",
	percent: 20,
	productIds: [7608, 7083, 7081, 7173, 7308, 7061, 7779, 7310, 7003, 7000, 7325],
	start: "2026-11-14T00:00:00+08:00",
} as const;
