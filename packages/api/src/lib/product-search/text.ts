import { lookup } from "@vit/shared/lookup";
import type { ProductSearchSourceDocument } from "~/lib/product-search/types";

const CYRILLIC_TO_LATIN = {
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

const LATIN_SEARCH_ALIASES = {
	ahcc: ["ахцц"],
	areds: ["preservision"],
	ashwagandha: ["ashwaganda", "aswagandha", "ашваганда", "ашвагандха"],
	berberine: ["берберин"],
	betaine: ["бетаин", "betaine hcl"],
	biotin: ["биотин"],
	blackmores: ["blackmore", "black mores", "black more", "блэкморс"],
	boric: ["boric acid", "борная"],
	calcium: ["кальци", "калци", "calci"],
	collagen: ["коллаген", "colagen", "kollagen", "коллоген"],
	coq10: ["coenzyme q10", "co q10", "koq10", "коэнзим"],
	creatine: ["creatin", "kreatin", "креатин"],
	curcumin: ["куркумин"],
	echinacea: ["эхинацея", "echinacea purpurea"],
	elderberry: ["бузина", "sambucus"],
	fish: ["загас"],
	folate: ["folic", "folic acid", "фолиевая", "фолат"],
	ginkgo: ["гинкго", "ginko", "ginkgo biloba"],
	ginseng: ["женьшень", "ginzeng"],
	glucosamine: ["глюкозамин", "glucosamin"],
	glutathione: ["глутатион", "glutathion"],
	gummies: ["gummy", "jelly", "гамми"],
	hyaluronic: ["hyaluron", "hyaluronic acid", "гиалари", "гиул", "гиалурон"],
	inositol: ["inofa", "inof", "inosto", "myo inositol", "инозитол", "инозит"],
	iodine: ["iodine", "йод"],
	iron: ["төмөр", "ferrum", "tomor", "tumur"],
	lutein: ["лютеин"],
	lysine: ["лизин"],
	magnesium: ["magni", "магни", "магниум", "magnez", "магнези"],
	melatonin: ["мелатонин", "melatonine"],
	melissa: ["мелисса", "lemon balm"],
	naturebell: ["nature bell", "natures bell", "naturbell"],
	niacin: ["ниацин", "niacinamide"],
	oil: ["тос"],
	omega: ["омега", "omeg"],
	potassium: ["калий", "kalium"],
	probiotic: ["пробиотик", "probiotics", "probiotik", "bacteria", "bakteri", "бактери"],
	protein: ["протеин", "whey"],
	psyllium: ["physil", "psylium"],
	pumpkin: ["pumpkin seed", "тыквенное"],
	quercetin: ["кверцетин"],
	reishi: ["рейши", "reishii"],
	resveratrol: ["ресвератрол"],
	rhodiola: ["родиола", "rodiola"],
	selenium: ["селен", "selen"],
	spirulina: ["спирулина"],
	taurine: ["таурин"],
	tudca: ["tudka", "тудка", "тудца"],
	turmeric: ["curcumin", "куркумин", "куркума"],
	vitamin: ["vit", "витамин", "витамины"],
	zinc: ["цинк", "zink"],
};

// Whole-word query phrases rewritten to the term the catalog uses.
const QUERY_PHRASE_ALIASES = {
	"black more": "blackmores",
	blackmore: "blackmores",
	"black mores": "blackmores",
	"jarrow formula": "jarrow formulas",
	naturbell: "naturebell",
	"nature bell": "naturebell",
	"natures bell": "naturebell",
	фолийн: "folate",
	"фолийн хүчил": "folate",
};

const VITAMIN_LETTER_ALIASES = {
	b: "vitamin b",
	c: "vitamin c",
	d: "d3",
	e: "vitamin e",
	k: "k2",
	б: "vitamin b",
	д: "d3",
	е: "vitamin e",
	к: "k2",
	с: "vitamin c",
	ц: "vitamin c",
};

const VITAMIN_WORDS = new Set(["vit", "vitamin", "витамин"]);

// Cyrillic letters in codes like "д3" or "б12", read as the Latin vitamin letter.
const CODE_LETTERS = { б: "b", д: "d", к: "k", с: "c", ц: "c" };

const SYMPTOM_INGREDIENT_ALIASES = {
	anxiety: ["ashwagandha", "l theanine", "magnesium"],
	fatigue: ["b complex", "b12", "iron", "coq10", "ashwagandha"],
	hair: ["biotin", "collagen", "zinc"],
	immune: ["zinc", "vitamin c", "probiotic"],
	immunity: ["zinc", "vitamin c", "probiotic", "vitamin d3"],
	insomnia: ["melatonin", "5 htp"],
	joint: ["glucosamine", "collagen", "omega 3"],
	joints: ["glucosamine", "collagen", "omega 3"],
	menstrual: ["magnesium", "b6", "iron", "evening primrose"],
	period: ["magnesium", "b6", "iron", "evening primrose"],
	skin: ["collagen", "hyaluronic", "vitamin c"],
	sleep: ["melatonin", "5 htp", "magnesium"],
	stress: ["ashwagandha", "magnesium", "l theanine"],
	tiredness: ["b complex", "b12", "iron", "coq10"],
	арьс: ["collagen", "hyaluronic", "vitamin c"],
	дархлаа: ["zinc", "vitamin c", "probiotic", "vitamin d3"],
	менст: ["magnesium", "b6", "iron", "evening primrose"],
	менструац: ["magnesium", "b6", "iron", "evening primrose"],
	нойр: ["melatonin", "5 htp", "magnesium"],
	нойргүйдэл: ["melatonin", "5 htp", "magnesium"],
	стресс: ["ashwagandha", "magnesium", "l theanine"],
	"үе мөч": ["glucosamine", "collagen", "omega 3"],
	үс: ["biotin", "collagen", "zinc"],
	ядаргаа: ["b complex", "b12", "iron", "coq10", "ashwagandha"],
};

export const normalizeSearchText = (value: string | null | undefined) =>
	(value ?? "")
		.normalize("NFKC")
		.toLowerCase()
		.replaceAll(/(?<=\d),(?=\d)/g, "")
		.replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
		.replaceAll(/\s+/g, " ")
		.trim();

export const transliterateCyrillicToLatin = (value: string | null | undefined) =>
	Array.from(normalizeSearchText(value))
		.map((char) => lookup(CYRILLIC_TO_LATIN, char) ?? char)
		.join("");

export const expandLatinAliases = (value: string | null | undefined) => {
	const normalized = normalizeSearchText(value);
	if (!normalized) {
		return [];
	}

	const aliases = new Set<string>();
	for (const token of normalized.split(" ")) {
		aliases.add(token);
		for (const alias of lookup(LATIN_SEARCH_ALIASES, token) ?? []) {
			aliases.add(alias);
		}
	}

	return [...aliases].filter(Boolean);
};

export const uniqueText = (values: Array<string | null | undefined>) =>
	Array.from(
		new Set(values.map((value) => normalizeSearchText(value)).filter((value) => value.length > 0)),
	);

const toTextList = (value: Array<string> | string | null | undefined) => {
	if (Array.isArray(value)) {
		return value;
	}
	return value ? [value] : [];
};

const productSearchStrings = (product: ProductSearchSourceDocument) => [
	product.name,
	product.nameMn,
	product.brand,
	product.category,
	`${product.brand} ${product.name}`,
	`${product.category} ${product.name}`,
	product.amount,
	product.potency,
	...toTextList(product.ingredients),
	...toTextList(product.tags),
];

/**
 * Transliterations cover the whole name. Spelling aliases come only from the
 * primary name and brand, so "zink" finds zinc products, not elderberry
 * gummies "with zinc".
 */
export const buildProductAliases = (names: Array<string>, primaryNames: Array<string>) => {
	const originals = new Set(uniqueText(names));
	const originalTokens = new Set(
		[...originals].flatMap((value) => value.split(" ").filter(Boolean)),
	);
	const alternatives = uniqueText([
		...names.map((value) => transliterateCyrillicToLatin(value)),
		...primaryNames.flatMap((value) => expandLatinAliases(value)),
	]);

	return alternatives.filter((alias) => !originals.has(alias) && !originalTokens.has(alias));
};

export const buildProductIntentTerms = (product: ProductSearchSourceDocument) => {
	const haystack = normalizeSearchText(productSearchStrings(product).join(" "));
	if (!haystack) {
		return [];
	}

	return uniqueText(
		Object.entries(SYMPTOM_INGREDIENT_ALIASES).flatMap(([symptom, ingredients]) =>
			ingredients.some((ingredient) => haystack.includes(normalizeSearchText(ingredient)))
				? [symptom, transliterateCyrillicToLatin(symptom)]
				: [],
		),
	);
};

// Longest phrase first so "black mores" is not clobbered by "black more".
const phraseAliases = Object.entries(QUERY_PHRASE_ALIASES)
	.toSorted(([a], [b]) => b.length - a.length)
	.map(([phrase, canonical]) => [new RegExp(`(?<=^| )${phrase}(?= |$)`, "gu"), canonical] as const);

// "d35000" is "d3 5000". A lone letter joins the number after it, so "q 10" is "q10".
// Glued codes split too: "d3k2" and "д3к2" are "d3 k2".
const splitCodes = (token: string) => {
	const latin = token.replaceAll(
		/[бдксц](?=\d)/gu,
		(letter) => lookup(CODE_LETTERS, letter) ?? letter,
	);
	if (/^(?:[a-z]\d{1,2}){2,}$/u.test(latin)) {
		return latin.match(/[a-z]\d{1,2}/gu) ?? [latin];
	}
	return latin.replace(/^(d3|k2)(\d{3,})$/u, "$1 $2").split(" ");
};

const joinCodeTokens = (tokens: Array<string>) =>
	tokens.flatMap(splitCodes).reduce<Array<string>>((joined, token) => {
		const previous = joined.at(-1);
		if (previous && /^\p{L}$/u.test(previous) && /^\d{1,2}$/u.test(token)) {
			joined[joined.length - 1] = `${lookup(CODE_LETTERS, previous) ?? previous}${token}`;
		} else {
			joined.push(token);
		}
		return joined;
	}, []);

// A lone vitamin letter means the vitamin only on its own or next to "vitamin",
// so "d" in "myo d chiro inositol" and "b" in "b complex" stay letters.
// "витамин ц" reads as "vitamin c".
const expandVitaminLetters = (tokens: Array<string>) => {
	const isVitaminLetter = (index: number) =>
		lookup(VITAMIN_LETTER_ALIASES, tokens[index] ?? "") !== undefined &&
		(tokens.length === 1 ||
			VITAMIN_WORDS.has(tokens[index - 1] ?? "") ||
			VITAMIN_WORDS.has(tokens[index + 1] ?? ""));
	return tokens.flatMap((token, index) => {
		if (isVitaminLetter(index)) {
			return (lookup(VITAMIN_LETTER_ALIASES, token) ?? token).split(" ");
		}
		return VITAMIN_WORDS.has(token) && (isVitaminLetter(index - 1) || isVitaminLetter(index + 1))
			? ["vitamin"]
			: [token];
	});
};

// Mongolian case endings customers add to product words, Latin and Cyrillic.
const CASE_SUFFIXES = [
	"iinhiig",
	"ийнхийг",
	"уудыг",
	"nuud",
	"iig",
	"iin",
	"nii",
	"tai",
	"tei",
	"toi",
	"uud",
	"ийг",
	"ийн",
	"ний",
	"тай",
	"тэй",
	"той",
	"ууд",
	"үүд",
	"aa",
	"ee",
	"ii",
	"oo",
	"аа",
	"ыг",
	"ээ",
	"оо",
];

/**
 * Other spellings a query word also matches: its stem without a Mongolian case
 * ending ("vitaminuud", "k2toi", "naturebelliin"), and for Cyrillic words of
 * three or more letters the Latin transliteration the aliases carry, so "мүл"
 * finds "Мулейны".
 */
export const searchSpellings = (token: string) => {
	const ending =
		token.length >= 5
			? CASE_SUFFIXES.find((suffix) => token.endsWith(suffix) && token.length - suffix.length >= 2)
			: undefined;
	const forms = ending ? [token, token.slice(0, -ending.length)] : [token];
	return Array.from(
		new Set(
			forms.flatMap((form) => {
				const latin = transliterateCyrillicToLatin(form);
				return latin !== form && form.length >= 3 ? [form, latin] : [form];
			}),
		),
	);
};

export const parseSearchQuery = (query: string) => {
	const phrase = phraseAliases.reduce(
		(text, [pattern, canonical]) => text.replace(pattern, canonical),
		normalizeSearchText(query),
	);
	const tokens = Array.from(
		new Set(expandVitaminLetters(joinCodeTokens(phrase.split(" ").filter(Boolean)))),
	);
	return { phrase: tokens.join(" "), tokens };
};

export const expandSymptomIngredients = (value: string | null | undefined) => {
	const normalized = normalizeSearchText(value);
	if (!normalized) {
		return [];
	}

	const ingredients: Array<string> = [];
	for (const [symptom, terms] of Object.entries(SYMPTOM_INGREDIENT_ALIASES)) {
		if (normalized.includes(normalizeSearchText(symptom))) {
			ingredients.push(...terms);
		}
	}

	return ingredients;
};
