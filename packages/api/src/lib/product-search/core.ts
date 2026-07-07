import MiniSearch, { type Options, type SearchResult } from "minisearch";
import {
	buildProductAliases,
	createSearchQueries,
	normalizeSearchText,
} from "~/lib/product-search/text";
import type {
	ProductSearchDocument,
	ProductSearchFilters,
	ProductSearchSnapshot,
	ProductSearchSourceDocument,
	SearchProductResult,
} from "~/lib/product-search/types";

const toTextList = (value: string[] | string | null | undefined) => {
	if (Array.isArray(value)) return value;
	if (typeof value === "string") return value ? [value] : [];
	return [];
};

const concatBrandPrefix = (brand: string, title: string) => {
	const b = brand.trim();
	const t = title.trim();
	if (!b) return title;
	if (normalizeSearchText(t).startsWith(normalizeSearchText(b))) return t;
	return t ? `${b} ${t}` : b;
};

const PRODUCT_SEARCH_OPTIONS: Options<ProductSearchDocument> = {
	idField: "id",
	fields: [
		"name",
		"nameMn",
		"nameWithBrand",
		"nameMnWithBrand",
		"brand",
		"category",
		"amount",
		"potency",
		"ingredients",
		"tags",
		"aliases",
		"normalized",
		"description",
	],
	storeFields: [
		"id",
		"name",
		"nameMn",
		"slug",
		"price",
		"discount",
		"brand",
		"category",
		"status",
		"stock",
		"inStock",
		"amount",
		"potency",
		"dailyIntake",
		"brandId",
		"categoryId",
		"isFeatured",
		"image",
		"hasImage",
		"ingredientPreview",
	],
	searchOptions: {
		boost: {
			name: 5,
			nameMn: 5,
			nameWithBrand: 5,
			nameMnWithBrand: 5,
			aliases: 4,
			normalized: 4,
			brand: 3,
			category: 2,
			ingredients: 1.5,
			tags: 1.5,
			description: 0.5,
		},
		prefix: true,
		fuzzy: (term: string) => (term.length >= 4 ? 0.2 : false),
	},
};

export const createProductMiniSearch = () =>
	new MiniSearch<ProductSearchDocument>(PRODUCT_SEARCH_OPTIONS);

export const buildProductSearchDocument = (
	product: ProductSearchSourceDocument,
): ProductSearchDocument => {
	const aliases = buildProductAliases(product);
	const ingredients = toTextList(product.ingredients);
	const tags = toTextList(product.tags);
	const image = product.image ?? "";
	const nameMn = product.nameMn ?? "";
	const nameWithBrand = concatBrandPrefix(product.brand, product.name);
	const nameMnWithBrand =
		nameMn.trim().length === 0 ? "" : concatBrandPrefix(product.brand, nameMn);

	return {
		id: product.id,
		name: product.name,
		nameMn,
		nameWithBrand,
		nameMnWithBrand,
		description: product.description ?? "",
		slug: product.slug,
		price: product.price,
		discount: product.discount ?? 0,
		brand: product.brand,
		category: product.category,
		status: product.status,
		stock: product.stock,
		inStock: product.stock > 0 && product.status === "active",
		amount: product.amount ?? "",
		potency: product.potency ?? "",
		dailyIntake: product.dailyIntake ?? 0,
		brandId: product.brandId,
		categoryId: product.categoryId,
		isFeatured: product.isFeatured ?? false,
		image,
		hasImage: Boolean(image),
		ingredientPreview: ingredients.slice(0, 5),
		ingredients: ingredients.join(" "),
		tags: tags.join(" "),
		aliases: aliases.join(" "),
		normalized: aliases.join(" "),
	};
};

export const buildProductSearchSnapshot = (
	documents: ProductSearchDocument[],
): ProductSearchSnapshot => {
	const miniSearch = createProductMiniSearch();
	miniSearch.addAll(documents);

	return {
		version: 1,
		generatedAt: new Date().toISOString(),
		productCount: documents.length,
		documents,
		indexJson: JSON.stringify(miniSearch),
	};
};

export const hydrateProductSearchSnapshot = (
	snapshot: ProductSearchSnapshot,
) => ({
	miniSearch: MiniSearch.loadJSON<ProductSearchDocument>(
		snapshot.indexJson,
		PRODUCT_SEARCH_OPTIONS,
	),
	documentsById: new Map(snapshot.documents.map((doc) => [doc.id, doc])),
});

const resultMatchesFilters = (
	result: SearchResult,
	filters?: ProductSearchFilters,
) => {
	if (filters?.brandId != null && result.brandId !== filters.brandId) {
		return false;
	}
	if (filters?.categoryId != null && result.categoryId !== filters.categoryId) {
		return false;
	}
	return true;
};

const tokenizeSearchText = (value: string) =>
	normalizeSearchText(value).split(" ").filter(Boolean);

const withoutTerms = (terms: string[], termsToRemove: string[]) => {
	const remove = new Set(termsToRemove);
	return terms.filter((term) => !remove.has(term)).join(" ");
};

const getPhraseTokenIndex = (value: string, phrase: string) => {
	const tokens = tokenizeSearchText(value);
	const phraseTokens = tokenizeSearchText(phrase);
	if (tokens.length === 0 || phraseTokens.length === 0) return -1;

	for (let index = 0; index <= tokens.length - phraseTokens.length; index++) {
		if (
			phraseTokens.every(
				(phraseToken, phraseIndex) =>
					tokens[index + phraseIndex] === phraseToken,
			)
		) {
			return index;
		}
	}

	return -1;
};

const scoreSearchResult = (
	result: SearchResult,
	documentsById: Map<number, ProductSearchDocument>,
	query: string,
) => {
	const document = documentsById.get(Number(result.id));
	const normalizedQuery = normalizeSearchText(query);
	const terms = tokenizeSearchText(query);
	if (!document || !normalizedQuery || terms.length === 0) {
		return result.score ?? 0;
	}

	const brandName =
		document.nameWithBrand ?? concatBrandPrefix(document.brand, document.name);
	const brandNameMn =
		document.nameMnWithBrand ??
		(document.nameMn.trim().length > 0
			? concatBrandPrefix(document.brand, document.nameMn)
			: "");
	const brandTerms = tokenizeSearchText(document.brand);
	const productIntent = withoutTerms(terms, brandTerms);

	const name = normalizeSearchText(
		[document.name, document.nameMn, brandName, brandNameMn].join(" "),
	);
	const productName = normalizeSearchText(`${document.name} ${document.nameMn}`);
	const aliases = normalizeSearchText(
		`${document.aliases} ${document.normalized}`,
	);
	const haystack = normalizeSearchText(
		[
			document.name,
			document.nameMn,
			brandName,
			brandNameMn,
			document.brand,
			document.category,
			document.amount,
			document.potency,
			document.ingredients,
			document.tags,
			document.aliases,
			document.normalized,
			document.description,
		].join(" "),
	);
	const allTermsInName = terms.every((term) => name.split(" ").includes(term));
	const allTermsInHaystack = terms.every((term) =>
		haystack.split(" ").includes(term),
	);
	const productIntentIndex = productIntent
		? getPhraseTokenIndex(productName, productIntent)
		: -1;
	const stockScore = document.inStock
		? Math.min(Math.log1p(Math.max(document.stock, 0)) * 45, 240)
		: -500;

	let score = result.score ?? 0;
	if (name === normalizedQuery) score += 2000;
	if (name.startsWith(normalizedQuery)) score += 1600;
	if (name.includes(normalizedQuery)) score += 1400;
	if (aliases.includes(normalizedQuery)) score += 1000;
	if (allTermsInName) score += 800;
	if (allTermsInHaystack) score += 400;
	if (productIntentIndex === 0) score += 2400;
	else if (productIntentIndex > 0 && productIntentIndex <= 2) score += 2000;
	else if (productIntentIndex > 2 && productIntentIndex <= 5) score += 900;
	else if (productIntentIndex > 5) score += 250;
	score += stockScore;

	return score;
};

export const mapMiniSearchResult = (
	result: SearchResult,
	documentsById: Map<number, ProductSearchDocument>,
): SearchProductResult => {
	const id = Number(result.id);
	const stored = result as Partial<ProductSearchDocument>;
	const document = documentsById.get(id);

	return {
		id,
		name: stored.name ?? document?.name ?? "",
		nameMn: stored.nameMn || document?.nameMn || undefined,
		slug: stored.slug ?? document?.slug ?? "",
		price: stored.price ?? document?.price ?? 0,
		discount: stored.discount ?? document?.discount ?? 0,
		brand: stored.brand ?? document?.brand ?? "",
		category: stored.category ?? document?.category ?? "",
		status: stored.status ?? document?.status ?? "draft",
		stock: stored.stock ?? document?.stock ?? 0,
		inStock: stored.inStock ?? document?.inStock ?? false,
		amount: stored.amount ?? document?.amount ?? "",
		potency: stored.potency ?? document?.potency ?? "",
		dailyIntake: stored.dailyIntake ?? document?.dailyIntake ?? 0,
		brandId: stored.brandId ?? document?.brandId,
		categoryId: stored.categoryId ?? document?.categoryId,
		isFeatured: stored.isFeatured ?? document?.isFeatured ?? false,
		image: stored.image ?? document?.image ?? "",
		hasImage: stored.hasImage ?? document?.hasImage ?? false,
		ingredientPreview:
			stored.ingredientPreview ?? document?.ingredientPreview ?? [],
	};
};

export const searchMiniSearchIndex = (
	miniSearch: MiniSearch<ProductSearchDocument>,
	documentsById: Map<number, ProductSearchDocument>,
	query: string,
	limit: number,
	filters?: ProductSearchFilters,
) => {
	const trimmed = query.trim();
	if (!trimmed) return [];

	const safeLimit = Math.min(Math.max(limit, 1), 1000);
	const rankedResults = new Map<string, SearchResult>();
	for (const searchQuery of createSearchQueries(trimmed)) {
		const searchOptions = {
			...PRODUCT_SEARCH_OPTIONS.searchOptions,
			filter: (result: SearchResult) => resultMatchesFilters(result, filters),
		};
		const tokens = tokenizeSearchText(searchQuery);
		const matchableQuery =
			tokens.length > 1
				? tokens
						.filter(
							(token) => miniSearch.search(token, searchOptions).length > 0,
						)
						.join(" ")
				: searchQuery;
		if (!matchableQuery) continue;

		const results = miniSearch.search(matchableQuery, {
			...searchOptions,
			combineWith: "AND",
		});

		for (const result of results) {
			const existing = rankedResults.get(String(result.id));
			if (!existing || (result.score ?? 0) > (existing.score ?? 0)) {
				rankedResults.set(String(result.id), result);
			}
		}
	}

	return Array.from(rankedResults.values())
		.sort(
			(a, b) =>
				scoreSearchResult(b, documentsById, trimmed) -
				scoreSearchResult(a, documentsById, trimmed),
		)
		.slice(0, safeLimit)
		.map((result) => mapMiniSearchResult(result, documentsById));
};
