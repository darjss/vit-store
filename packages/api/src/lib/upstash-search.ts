import { env } from "cloudflare:workers";
import { Search } from "@upstash/search";
import { logger } from "./logger";

let searchClient: Search | null = null;

export const getSearchClient = () => {
	if (!searchClient) {
		searchClient = new Search({
			url: env.UPSTASH_SEARCH_URL,
			token: env.UPSTASH_SEARCH_TOKEN,
		});
	}
	return searchClient;
};

export interface SearchProductResult {
	id: number;
	name: string;
	nameMn?: string;
	slug: string;
	price: number;
	discount: number;
	brand: string;
	category: string;
	status: string;
	stock: number;
	inStock: boolean;
	amount: string;
	potency: string;
	dailyIntake: number;
	brandId?: number;
	categoryId?: number;
	isFeatured: boolean;
	image: string;
	hasImage: boolean;
	ingredientPreview: string[];
}

export interface SearchProductsFilters {
	brandId?: number;
	categoryId?: number;
}

interface UpstashProductMetadata {
	productId: number;
	name: string;
	nameMn?: string;
	slug: string;
	price: number;
	discount: number;
	brand: string;
	category: string;
	status: string;
	stock: number;
	inStock: boolean;
	amount: string;
	potency: string;
	dailyIntake: number;
	brandId?: number;
	categoryId?: number;
	isFeatured: boolean;
	image: string;
	hasImage: boolean;
	ingredientPreview: string[];
	aliases: string[];
}

export interface UpstashProductDocument {
	id: number;
	name: string;
	nameMn?: string | null;
	description?: string | null;
	slug: string;
	price: number;
	discount?: number;
	brand: string;
	category: string;
	status: string;
	stock: number;
	amount?: string | null;
	potency?: string | null;
	dailyIntake?: number | null;
	brandId?: number;
	categoryId?: number;
	isFeatured?: boolean;
	ingredients?: string[];
	tags?: string[];
	image?: string;
}

const CYRILLIC_TO_LATIN: Record<string, string> = {
	а: "a",
	б: "b",
	в: "v",
	г: "g",
	д: "d",
	е: "e",
	ё: "yo",
	ж: "j",
	з: "z",
	и: "i",
	й: "i",
	к: "k",
	л: "l",
	м: "m",
	н: "n",
	о: "o",
	ө: "u",
	п: "p",
	р: "r",
	с: "s",
	т: "t",
	у: "u",
	ү: "u",
	ф: "f",
	х: "kh",
	ц: "ts",
	ч: "ch",
	ш: "sh",
	щ: "sh",
	ъ: "",
	ы: "y",
	ь: "",
	э: "e",
	ю: "yu",
	я: "ya",
};

const LATIN_SEARCH_ALIASES: Record<string, string[]> = {
	magnesium: ["magni", "магни", "магниум"],
	vitamin: ["vit", "витамин"],
	zinc: ["цинк"],
	omega: ["омега"],
	probiotic: ["пробиотик"],
	collagen: ["коллаген"],
	calcium: ["кальци"],
	iron: ["төмөр"],
	fish: ["загас"],
	oil: ["тос"],
};

const normalizeSearchText = (value: string | null | undefined) =>
	(value ?? "")
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

const transliterateCyrillicToLatin = (value: string | null | undefined) =>
	Array.from(normalizeSearchText(value))
		.map((char) => CYRILLIC_TO_LATIN[char] ?? char)
		.join("");

const expandLatinAliases = (value: string | null | undefined) => {
	const normalized = normalizeSearchText(value);
	if (!normalized) return [];

	const aliases = new Set<string>();
	for (const token of normalized.split(" ")) {
		aliases.add(token);
		for (const alias of LATIN_SEARCH_ALIASES[token] ?? []) {
			aliases.add(alias);
		}
	}

	return [...aliases].filter(Boolean);
};

const uniqueText = (values: Array<string | null | undefined>) =>
	Array.from(
		new Set(
			values
				.map((value) => normalizeSearchText(value))
				.filter((value) => value.length > 0),
		),
	);

const buildProductAliases = (product: UpstashProductDocument) => {
	const productStrings = [
		product.name,
		product.nameMn,
		product.brand,
		product.category,
		`${product.brand} ${product.name}`,
		`${product.category} ${product.name}`,
		product.amount,
		product.potency,
		...(product.ingredients ?? []),
		...(product.tags ?? []),
	];

	const aliases = uniqueText(productStrings);
	const transliterated = uniqueText(
		productStrings.map((value) => transliterateCyrillicToLatin(value)),
	);
	const latinExpanded = uniqueText(
		productStrings.flatMap((value) => expandLatinAliases(value)),
	);

	return Array.from(new Set([...aliases, ...transliterated, ...latinExpanded]));
};

const buildSearchContent = (product: UpstashProductDocument) => {
	const aliases = buildProductAliases(product);
	return {
		name: product.name,
		nameMn: product.nameMn || "",
		description: product.description || "",
		brand: product.brand,
		category: product.category,
		amount: product.amount || "",
		potency: product.potency || "",
		dailyIntake: String(product.dailyIntake ?? ""),
		ingredients: (product.ingredients ?? []).join(" "),
		tags: (product.tags ?? []).join(" "),
		aliases: aliases.join(" "),
		normalized: aliases.join(" "),
	};
};

const createSearchQueries = (query: string) => {
	const normalized = normalizeSearchText(query);
	const transliterated = transliterateCyrillicToLatin(query);
	const expanded = expandLatinAliases(query).join(" ");

	return Array.from(
		new Set(
			[query.trim(), normalized, transliterated, expanded].filter(Boolean),
		),
	);
};

const mapSearchResult = (
	resultId: string,
	metadata?: UpstashProductMetadata,
): SearchProductResult => ({
	id:
		metadata?.productId ??
		Number.parseInt(resultId.replace("product-", ""), 10),
	name: metadata?.name || "",
	nameMn: metadata?.nameMn || undefined,
	slug: metadata?.slug || "",
	price: metadata?.price || 0,
	discount: metadata?.discount || 0,
	brand: metadata?.brand || "",
	category: metadata?.category || "",
	status: metadata?.status || "draft",
	stock: metadata?.stock || 0,
	inStock: metadata?.inStock ?? false,
	amount: metadata?.amount || "",
	potency: metadata?.potency || "",
	dailyIntake: metadata?.dailyIntake || 0,
	brandId: metadata?.brandId,
	categoryId: metadata?.categoryId,
	isFeatured: metadata?.isFeatured ?? false,
	image: metadata?.image || "",
	hasImage: metadata?.hasImage ?? Boolean(metadata?.image),
	ingredientPreview: metadata?.ingredientPreview || [],
});

/**
 * Search products using Upstash Search.
 * Returns enough data to render search results directly without a second DB read.
 */
export const searchProducts = async (
	query: string,
	limit = 10,
	filters?: SearchProductsFilters,
): Promise<SearchProductResult[]> => {
	try {
		const client = getSearchClient();
		const safeLimit = Math.min(Math.max(limit, 1), 1000);
		const filterParts: string[] = [];
		if (filters?.brandId != null) {
			filterParts.push(`@metadata.brandId = ${filters.brandId}`);
		}
		if (filters?.categoryId != null) {
			filterParts.push(`@metadata.categoryId = ${filters.categoryId}`);
		}
		const filter =
			filterParts.length > 0 ? filterParts.join(" AND ") : undefined;

		for (const searchQuery of createSearchQueries(query)) {
			const results = await client.index("products").search({
				query: searchQuery,
				limit: safeLimit,
				filter,
			});

			if (results.length === 0) continue;

			return results.map((result) =>
				mapSearchResult(
					result.id,
					result.metadata as UpstashProductMetadata | undefined,
				),
			);
		}

		return [];
	} catch (error) {
		logger.error("upstash.search.error", error);
		return [];
	}
};

/**
 * Upsert a product into the search index.
 */
export const upsertProductToSearch = async (
	product: UpstashProductDocument,
) => {
	try {
		const client = getSearchClient();
		const aliases = buildProductAliases(product);
		await client.index("products").upsert({
			id: `product-${product.id}`,
			content: buildSearchContent(product),
			metadata: {
				productId: product.id,
				name: product.name,
				nameMn: product.nameMn || undefined,
				slug: product.slug,
				price: product.price,
				discount: product.discount || 0,
				brand: product.brand,
				category: product.category,
				status: product.status,
				stock: product.stock,
				inStock: product.stock > 0 && product.status === "active",
				amount: product.amount || "",
				potency: product.potency || "",
				dailyIntake: product.dailyIntake || 0,
				brandId: product.brandId,
				categoryId: product.categoryId,
				isFeatured: product.isFeatured ?? false,
				image: product.image || "",
				hasImage: Boolean(product.image),
				ingredientPreview: (product.ingredients ?? []).slice(0, 5),
				aliases,
			},
		});
	} catch (error) {
		logger.error("upstash.upsert.error", error);
	}
};

/**
 * Delete a product from the search index.
 */
export const deleteProductFromSearch = async (productId: number) => {
	try {
		const client = getSearchClient();
		await client.index("products").delete([`product-${productId}`]);
	} catch (error) {
		logger.error("upstash.delete.error", error);
	}
};
