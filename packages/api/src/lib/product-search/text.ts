import type { ProductSearchSourceDocument } from "~/lib/product-search/types";

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

export const normalizeSearchText = (value: string | null | undefined) =>
	(value ?? "")
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

export const transliterateCyrillicToLatin = (
	value: string | null | undefined,
) =>
	Array.from(normalizeSearchText(value))
		.map((char) => CYRILLIC_TO_LATIN[char] ?? char)
		.join("");

export const expandLatinAliases = (value: string | null | undefined) => {
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

export const uniqueText = (values: Array<string | null | undefined>) =>
	Array.from(
		new Set(
			values
				.map((value) => normalizeSearchText(value))
				.filter((value) => value.length > 0),
		),
	);

export const buildProductAliases = (product: ProductSearchSourceDocument) => {
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

export const createSearchQueries = (query: string) => {
	const normalized = normalizeSearchText(query);
	const transliterated = transliterateCyrillicToLatin(query);
	const expanded = expandLatinAliases(query).join(" ");

	return Array.from(
		new Set(
			[query.trim(), normalized, transliterated, expanded].filter(Boolean),
		),
	);
};
