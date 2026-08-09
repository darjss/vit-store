import {
	buildProductAliases,
	buildProductIntentTerms,
	normalizeSearchText,
} from "~/lib/product-search/text";
import type {
	ProductSearchAnalyticsSignal,
	ProductSearchDocument,
	ProductSearchRanking,
	ProductSearchSourceDocument,
} from "~/lib/product-search/types";

const toTextList = (value: string[] | string | null | undefined) => {
	if (Array.isArray(value)) return value;
	return value ? [value] : [];
};

const withBrand = (brand: string, name: string) => {
	const normalizedBrand = normalizeSearchText(brand);
	const normalizedName = normalizeSearchText(name);
	if (!normalizedBrand || normalizedName.startsWith(normalizedBrand))
		return name;
	return `${brand.trim()} ${name.trim()}`.trim();
};

const primaryName = (name: string, brand: string) => {
	const normalizedName = normalizeSearchText(name);
	const normalizedBrand = normalizeSearchText(brand);
	const withoutBrand =
		normalizedBrand && normalizedName.startsWith(normalizedBrand)
			? normalizedName.slice(normalizedBrand.length).trim()
			: normalizedName;
	return (
		withoutBrand.split(/\s+(?:combined\s+)?with\s+/u, 1)[0] ?? withoutBrand
	);
};

const availabilityScore = (stock: number) => {
	if (stock <= 0) return 0;
	if (stock <= 2) return 0.25;
	if (stock <= 9) return 0.65;
	return 1;
};

export const buildProductSearchRankings = (
	products: ProductSearchSourceDocument[],
	signals: ProductSearchAnalyticsSignal[],
) => {
	const signalsByProduct = new Map(
		signals.map((signal) => [signal.productId, signal]),
	);
	const rawDemand = (productId: number) => {
		const signal = signalsByProduct.get(productId);
		if (!signal) return 0;
		return (
			signal.uniqueViewers +
			signal.addToCarts * 3 +
			signal.searchClickSessions * 2
		);
	};
	const maxDemand = Math.max(0, ...products.map(({ id }) => rawDemand(id)));

	return new Map<number, ProductSearchRanking>(
		products.map((product) => {
			const demandScore =
				maxDemand > 0 ? Math.sqrt(rawDemand(product.id) / maxDemand) : 0;
			return [
				product.id,
				{
					rankingScore: Number(
						(demandScore * 45 + availabilityScore(product.stock) * 55).toFixed(
							4,
						),
					),
				},
			];
		}),
	);
};

const defaultRanking = (stock: number): ProductSearchRanking => ({
	rankingScore: availabilityScore(stock) * 55,
});

export const buildProductSearchDocument = (
	product: ProductSearchSourceDocument,
	ranking: ProductSearchRanking = defaultRanking(product.stock),
): ProductSearchDocument => {
	const ingredients = toTextList(product.ingredients);
	const tags = toTextList(product.tags);
	const aliases = buildProductAliases(product);
	const intentTerms = buildProductIntentTerms(product);
	const createdAt = new Date(product.createdAt).toISOString();
	const nameMn = product.nameMn ?? "";

	return {
		id: product.id,
		name: product.name,
		nameMn,
		nameWithBrand: withBrand(product.brand, product.name),
		nameMnWithBrand: nameMn ? withBrand(product.brand, nameMn) : "",
		primaryName: primaryName(product.name, product.brand),
		primaryNameMn: nameMn ? primaryName(nameMn, product.brand) : "",
		description: product.description ?? "",
		slug: product.slug,
		price: product.price,
		createdAt,
		createdAtEpoch: Date.parse(createdAt),
		discount: product.discount ?? 0,
		brand: product.brand,
		category: product.category,
		status: product.status,
		stock: product.stock,
		inStock: product.stock > 0 && product.status === "active",
		amount: product.amount ?? "",
		potency: product.potency ?? "",
		dosage: normalizeSearchText(
			`${product.amount ?? ""} ${product.potency ?? ""}`,
		),
		dailyIntake: product.dailyIntake ?? 0,
		brandId: product.brandId ?? -1,
		categoryId: product.categoryId ?? -1,
		isFeatured: product.isFeatured ?? false,
		image: product.image ?? "",
		hasImage: Boolean(product.image),
		ingredientPreviewJson: JSON.stringify(ingredients.slice(0, 5)),
		ingredients: ingredients.join(" "),
		tags: tags.join(" "),
		aliases: aliases.join(" "),
		intentTerms: intentTerms.join(" "),
		rankingScore: ranking.rankingScore,
	};
};
