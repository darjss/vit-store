import {
	buildProductAliases,
	buildProductIntentTerms,
	normalizeSearchText,
} from "~/lib/product-search/text";
import type {
	ProductSearchDocument,
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

export const buildProductSearchDocument = (
	product: ProductSearchSourceDocument,
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
	};
};
