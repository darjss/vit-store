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

const toTextList = (value: Array<string> | string | null | undefined) => {
	if (Array.isArray(value)) {
		return value;
	}
	return value ? [value] : [];
};

const withBrand = (brand: string, name: string) => {
	const normalizedBrand = normalizeSearchText(brand);
	const normalizedName = normalizeSearchText(name);
	if (!normalizedBrand || normalizedName.startsWith(normalizedBrand)) {
		return name;
	}
	return `${brand.trim()} ${name.trim()}`.trim();
};

const primaryName = (name: string, brand: string) => {
	const normalizedName = normalizeSearchText(name);
	const normalizedBrand = normalizeSearchText(brand);
	const withoutBrand =
		normalizedBrand && normalizedName.startsWith(normalizedBrand)
			? normalizedName.slice(normalizedBrand.length).trim()
			: normalizedName;
	return withoutBrand.split(/\s+(?:combined\s+)?with\s+/u, 1)[0] ?? withoutBrand;
};

const availabilityScore = (stock: number) => {
	if (stock <= 0) {
		return 0;
	}
	if (stock <= 2) {
		return 0.25;
	}
	if (stock <= 9) {
		return 0.65;
	}
	return 1;
};

export const buildProductSearchRankings = (
	products: Array<ProductSearchSourceDocument>,
	signals: Array<ProductSearchAnalyticsSignal>,
) => {
	const signalsByProduct = new Map(signals.map((signal) => [signal.productId, signal]));
	const rawDemand = (productId: number) => {
		const signal = signalsByProduct.get(productId);
		if (!signal) {
			return 0;
		}
		return signal.uniqueViewers + signal.addToCarts * 3 + signal.searchClickSessions * 2;
	};
	const maxDemand = Math.max(0, ...products.map(({ id }) => rawDemand(id)));

	return new Map<number, ProductSearchRanking>(
		products.map((product) => {
			const demandScore = maxDemand > 0 ? Math.sqrt(rawDemand(product.id) / maxDemand) : 0;
			return [
				product.id,
				{
					rankingScore: Number(
						(1 + demandScore * 44 + availabilityScore(product.stock) * 55).toFixed(4),
					),
				},
			];
		}),
	);
};

const defaultRanking = (stock: number): ProductSearchRanking => ({
	rankingScore: 1 + availabilityScore(stock) * 55,
});

function buildProductSearchTextFields(
	product: ProductSearchSourceDocument,
	ingredients: Array<string>,
	tags: Array<string>,
	aliases: Array<string>,
	intentTerms: Array<string>,
) {
	const nameMn = product.nameMn ?? "";
	return {
		aliases: aliases.join(" "),
		amount: product.amount ?? "",
		brand: product.brand,
		category: product.category,
		description: product.description ?? "",
		dosage: normalizeSearchText(`${product.amount ?? ""} ${product.potency ?? ""}`),
		ingredientPreviewJson: JSON.stringify(ingredients.slice(0, 5)),
		ingredients: ingredients.join(" "),
		intentTerms: intentTerms.join(" "),
		name: product.name,
		nameMn,
		nameMnWithBrand: nameMn ? withBrand(product.brand, nameMn) : "",
		nameWithBrand: withBrand(product.brand, product.name),
		potency: product.potency ?? "",
		primaryName: primaryName(product.name, product.brand),
		primaryNameMn: nameMn ? primaryName(nameMn, product.brand) : "",
		tags: tags.join(" "),
	};
}

export const buildProductSearchDocument = (
	product: ProductSearchSourceDocument,
	ranking: ProductSearchRanking = defaultRanking(product.stock),
): ProductSearchDocument => {
	const ingredients = toTextList(product.ingredients);
	const tags = toTextList(product.tags);
	const aliases = buildProductAliases(product);
	const intentTerms = buildProductIntentTerms(product);
	const createdAt = new Date(product.createdAt).toISOString();

	return {
		...buildProductSearchTextFields(product, ingredients, tags, aliases, intentTerms),
		brandId: product.brandId ?? -1,
		categoryId: product.categoryId ?? -1,
		createdAt,
		createdAtEpoch: Date.parse(createdAt),
		dailyIntake: product.dailyIntake ?? 0,
		discount: product.discount ?? 0,
		hasImage: Boolean(product.image),
		id: product.id,
		image: product.image ?? "",
		inStock: product.stock > 0 && product.status === "active",
		isFeatured: product.isFeatured ?? false,
		price: product.price,
		rankingScore: ranking.rankingScore,
		slug: product.slug,
		status: product.status,
		stock: product.stock,
	};
};
