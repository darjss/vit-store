import { PRICING_FORMULA } from "~/lib/ai-product/constants";

export function calculatePriceMntFromUsd(amazonPriceUsd: number): number {
	const raw =
		PRICING_FORMULA.slope * amazonPriceUsd + PRICING_FORMULA.intercept;
	const bounded = Math.min(
		PRICING_FORMULA.max,
		Math.max(PRICING_FORMULA.min, raw),
	);
	return (
		Math.round(bounded / PRICING_FORMULA.roundingStep) *
		PRICING_FORMULA.roundingStep
	);
}
