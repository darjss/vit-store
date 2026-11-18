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
 * page, and the first three are the home banner's cutout photos, so they
 * should be bottles: the pale Biotin pouch washes out on the dark banner.
 * Height Growth (7043) joined on 11.15 and sits high because its 16 bottles
 * near their expiry date. On 11.18 the owner took both magnesiums (7083, 7081)
 * off and added Naturebell ginkgo and glutathione and Nutricost boron 5 and
 * 10 mg. The ops script in vit-playground writes the
 * sale prices for these ids at the start and restores them at the end.
 */
export const SALE_CAMPAIGN = {
	end: "2026-11-30T23:59:59+08:00",
	name: "Black Friday",
	path: "/black-friday",
	percent: 20,
	productIds: [
		7173, 7327, 7184, 7043, 7608, 7634, 7264, 7308, 7061, 7779, 7310, 7003, 7000, 7325,
	],
	start: "2026-11-14T00:00:00+08:00",
} as const;
