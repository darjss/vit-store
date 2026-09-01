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

const LATIN_SEARCH_ALIASES: Record<string, Array<string>> = {
	ahcc: ["ахцц"],
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
	hyaluronic: ["hyaluron", "hyaluronic acid", "гиалари", "гиул", "гиалурон"],
	inositol: ["inofa", "inof", "inosto", "myo inositol", "инозитол", "инозит"],
	iodine: ["iodine", "йод"],
	iron: ["төмөр", "ferrum"],
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
	probiotic: ["пробиотик", "probiotics", "probiotik"],
	protein: ["протеин", "whey"],
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

const BRAND_ALIASES: Record<string, string> = {
	"black more": "blackmores",
	blackmore: "blackmores",
	"black mores": "blackmores",
	"jarrow formula": "jarrow formulas",
	naturbell: "naturebell",
	"nature bell": "naturebell",
	"natures bell": "naturebell",
};

const VITAMIN_LETTER_ALIASES: Record<string, string> = {
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
};

const SYMPTOM_INGREDIENT_ALIASES: Record<string, Array<string>> = {
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
		.map((char) => CYRILLIC_TO_LATIN[char] ?? char)
		.join("");

export const expandLatinAliases = (value: string | null | undefined) => {
	const normalized = normalizeSearchText(value);
	if (!normalized) {
		return [];
	}

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

export const buildProductAliases = (product: ProductSearchSourceDocument) => {
	const productStrings = [
		product.name,
		product.nameMn,
		product.brand,
		`${product.brand} ${product.name}`,
	];
	const originals = new Set(uniqueText(productStrings));
	const originalTokens = new Set(
		[...originals].flatMap((value) => value.split(" ").filter(Boolean)),
	);
	const alternatives = uniqueText([
		...productStrings.map((value) => transliterateCyrillicToLatin(value)),
		...productStrings.flatMap((value) => expandLatinAliases(value)),
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

export const expandBrandAliases = (value: string | null | undefined) => {
	let normalized = normalizeSearchText(value);
	if (!normalized) {
		return "";
	}

	let changed = false;
	for (const [phrase, canonical] of Object.entries(BRAND_ALIASES)) {
		if (normalized.includes(phrase)) {
			normalized = normalized.replaceAll(phrase, canonical);
			changed = true;
		}
	}

	return changed ? normalized : "";
};

export const expandVitaminLetters = (value: string | null | undefined) => {
	const tokens = normalizeSearchText(value).split(" ").filter(Boolean);
	let changed = false;
	const expanded = tokens.map((token) => {
		if ((token === "b" || token === "б") && tokens.length > 1) {
			return token;
		}
		const alias = VITAMIN_LETTER_ALIASES[token];
		if (alias) {
			changed = true;
			return alias;
		}
		return token;
	});

	return changed ? expanded.join(" ") : "";
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

export const createSearchQueries = (query: string) => {
	const normalized = normalizeSearchText(query);
	const transliterated = transliterateCyrillicToLatin(query);
	const expanded = expandLatinAliases(query).join(" ");
	const vitaminExpanded = expandVitaminLetters(query);
	const vitaminExpandedTranslit = expandVitaminLetters(transliterated);
	const brandExpanded = expandBrandAliases(query);
	const symptomExpanded = expandSymptomIngredients(query);

	return Array.from(
		new Set(
			[
				query.trim(),
				normalized,
				transliterated,
				expanded,
				vitaminExpanded,
				vitaminExpandedTranslit,
				brandExpanded,
				...symptomExpanded,
			].filter(Boolean),
		),
	);
};
