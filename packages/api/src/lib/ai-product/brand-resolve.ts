import { brandQueries } from "@vit/api/queries";
import { DEFAULT_BRAND_LOGO_URL } from "~/lib/ai-product/constants";
import { logger } from "~/lib/logger";
import { slugify } from "~/lib/utils";

export function normalizeBrandName(name: string): string {
	return name.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function generateCleanSlug(
	productName: string,
	brandName: string | null,
	amount: string,
	potency: string,
): string {
	const fullName = `${brandName || ""} ${productName} ${potency} ${amount}`;
	return fullName
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-")
		.replaceAll(/^-+|-+$/g, "");
}

export async function resolveOrCreateBrandId(
	brandName: string | null,
	brands: Array<{ id: number; name: string }>,
): Promise<number | null> {
	if (!brandName?.trim()) {
		return null;
	}

	const normalizedTarget = normalizeBrandName(brandName);
	const existing = brands.find((brand) => normalizeBrandName(brand.name) === normalizedTarget);
	if (existing) {
		return existing.id;
	}

	const cleanBrandName = brandName.trim().replaceAll(/\s+/g, " ");
	try {
		const created = await brandQueries.admin.createBrand({
			logoUrl: DEFAULT_BRAND_LOGO_URL,
			name: cleanBrandName,
			slug: slugify(cleanBrandName),
		});
		logger.info("aiProduct.brandAutoCreate", {
			brandId: created?.id ?? null,
			brandName: cleanBrandName,
		});
		return created?.id ?? null;
	} catch (error) {
		logger.warn("aiProduct.brandAutoCreateConflict", {
			brandName: cleanBrandName,
			error: error instanceof Error ? error.message : "unknown",
		});
		const latestBrands = await brandQueries.admin.getAllBrands();
		const matched = latestBrands.find(
			(brand) => normalizeBrandName(brand.name) === normalizedTarget,
		);
		return matched?.id ?? null;
	}
}

export function createSlug(
	name: string,
	brandName: string | null,
	amount: string,
	potency: string,
): string {
	return generateCleanSlug(name, brandName, amount, potency);
}
