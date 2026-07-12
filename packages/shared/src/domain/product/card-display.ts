export interface ProductCardDisplayInput {
	name: string;
	nameMn?: string | null;
	brand?: string | null;
	potency?: string | null;
	amount?: string | null;
}

export interface ProductCardDisplay {
	shortName: string;
	dose?: string;
	form?: string;
	count?: string;
	packageQuantity?: string;
	accessibleName: string;
}

const MAX_SHORT_NAME = 68;
const MAX_DOSE = 72;
const MAX_ACCESSIBLE_NAME = 180;

const DOSE_TOKEN_PATTERN =
	/\b\d[\d,.]*\s*(?:mcg|μg|мкг|mg|мг|g|гр|ml|мл|iu|оу(?:н)?|cfu|spu|billion|million|%)\b/giu;
const PACKAGE_MEASURE_PATTERN =
	/\b\d[\d,.]*\s*(?:fl\s*oz|ounces?|oz|pounds?|lbs?|kilograms?|kg|grams?|g|milliliters?|ml|liters?|l)\b/giu;

const FORM_DEFINITIONS: Array<{ pattern: RegExp; label: string }> = [
	{
		pattern:
			/(?:mini[-\s]*)?(?:veggie\s+)?soft[-\s]*gels?|softgel\s+capsules?/iu,
		label: "Зөөлөн капсул",
	},
	{
		pattern:
			/(?:(?:veg(?:gie|an)?|vegetarian|dr)\s+)?(?:capsules?|caps?)|v-?caps/iu,
		label: "Капсул",
	},
	{
		pattern: /(?:(?:chewable|bisected|vegetarian)\s+)?tablets?|tabs?/iu,
		label: "Шахмал",
	},
	{
		pattern:
			/(?:pectin-based(?:\s+[\w-]+){0,2}\s+)?chews?|gummy\s+chews?|gummies?/iu,
		label: "Гами",
	},
	{ pattern: /lozenges?/iu, label: "Хүлхдэг шахмал" },
	{ pattern: /pills?/iu, label: "Үрэл" },
	{ pattern: /drops?/iu, label: "Дусал" },
	{ pattern: /(?:stick\s+packs?|packets?|sachets?)/iu, label: "Уут" },
	{ pattern: /gels?/iu, label: "Гель" },
	{ pattern: /(?:pieces?|count|ct|ширхэг)/iu, label: "Ширхэг" },
];

const BRAND_ALIASES: Record<string, string[]> = {
	now: ["NOW Foods Supplements", "NOW Foods", "NOW"],
	maryruths: ["MaryRuth Organics", "Mary Ruth Organics", "Mary Ruth's"],
	microingredients: ["Micro Ingredients", "Microingredients"],
	drtobias: ["Dr. Tobias", "DR TOBIAS"],
};

const compactKey = (value: string) =>
	value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const clean = (value: string) =>
	value
		.replace(/^\s*[-–—,:|•·]+\s*/u, "")
		.replace(/\s*[,|•·]\s*/gu, " ")
		.replace(/\s*\+\s*(?=$)/gu, "")
		.replace(/(^|\s)\+(?=\s|$)/gu, " ")
		.replace(/\s{2,}/gu, " ")
		.trim();

const bounded = (value: string, max: number) => {
	if (value.length <= max) return value;
	const candidate = value.slice(0, max - 1);
	const wordBoundary = candidate.lastIndexOf(" ");
	return `${candidate.slice(0, wordBoundary >= max / 2 ? wordBoundary : undefined).trim()}…`;
};

const removePrefix = (name: string, prefix: string) => {
	const prefixKey = compactKey(prefix);
	let currentKey = "";
	for (let index = 0; index < name.length; index += 1) {
		currentKey += compactKey(name[index]);
		if (!prefixKey.startsWith(currentKey)) return;
		if (currentKey === prefixKey) return name.slice(index + 1).trim();
	}
};

const removeBrandPrefix = (name: string, brand?: string | null) => {
	if (!brand?.trim()) return name;
	const brandKey = compactKey(brand);
	const aliases = BRAND_ALIASES[brandKey] ?? [brand];
	for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
		const remainder = removePrefix(name, alias);
		if (remainder !== undefined) return remainder;
	}
	return name;
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const normalizePackageQuantity = (value: string) =>
	clean(
		value
			.replace(/(\d)(fl\s*oz|oz|lb|lbs|kg|g|ml|l)\b/giu, "$1 $2")
			.replace(/\s*\(\s*/gu, " (")
			.replace(/\s*\)\s*/gu, ")"),
	);

const findStandaloneForm = (value: string) => {
	const definition = FORM_DEFINITIONS.find(({ pattern }) =>
		pattern.test(value),
	);
	if (definition) return definition.label;
	if (/powders?|нунтаг/iu.test(value)) return "Нунтаг";
	if (/liquids?|oils?|solutions?|шингэн/iu.test(value)) return "Шингэн";
};

const inferPackageForm = (amount?: string | null) =>
	amount && /\b(?:fl\s*oz|milliliters?|ml|liters?|l)\b/iu.test(amount)
		? "Шингэн"
		: undefined;

const findItemAmount = (amount: string) => {
	for (const definition of FORM_DEFINITIONS) {
		const match = amount.match(
			new RegExp(
				String.raw`\b(\d[\d,.]*)\s+(${definition.pattern.source})\b`,
				"iu",
			),
		);
		if (match) {
			return { count: match[1], form: definition.label, matched: match[0] };
		}
	}
	const shorthand = amount.match(/^\s*(\d+)s\s*$/iu);
	return shorthand
		? { count: shorthand[1], form: "Ширхэг", matched: shorthand[0] }
		: undefined;
};

const packageRemainder = (amount: string, matchedItem?: string) => {
	if (!matchedItem) return normalizePackageQuantity(amount) || undefined;
	const remainder = clean(
		amount.replace(new RegExp(escapeRegExp(matchedItem), "iu"), ""),
	);
	return remainder ? normalizePackageQuantity(remainder) : undefined;
};

const conciseDose = (potency: string) => {
	const tokens = (potency.match(DOSE_TOKEN_PATTERN) ?? [])
		.map((token) => token.replace(/\s+/gu, " ").trim())
		.slice(0, 3);
	return tokens.length > 0 ? bounded(tokens.join(" + "), MAX_DOSE) : undefined;
};

const removeExact = (value: string, phrase?: string | null) =>
	phrase?.trim()
		? value.replace(new RegExp(escapeRegExp(phrase.trim()), "giu"), "")
		: value;

const stripFormVocabulary = (value: string) => {
	let result = value;
	for (const definition of FORM_DEFINITIONS) {
		result = result.replace(new RegExp(definition.pattern.source, "giu"), "");
	}
	return result
		.replace(/\b(?:powders?|liquids?|нунтаг|шингэн)\b/giu, "")
		.replace(/\b\d+s\b/giu, "");
};

const conciseShortName = (value: string) => {
	const firstClause = clean(value).split(/\s+(?:[-–—|])\s+|\s*,\s*/u)[0];
	return bounded(firstClause, MAX_SHORT_NAME);
};

/** Card-only projection. Imported names remain untouched for PDP/source use. */
export const projectProductCardDisplay = (
	product: ProductCardDisplayInput,
): ProductCardDisplay => {
	const sourceName = removeBrandPrefix(
		product.nameMn?.trim() || product.name,
		product.brand,
	);
	const itemAmount = product.amount
		? findItemAmount(product.amount)
		: undefined;
	const titleForm =
		findStandaloneForm(sourceName) ?? findStandaloneForm(product.amount ?? "");
	const form =
		itemAmount?.form === "Ширхэг"
			? (titleForm ?? itemAmount.form)
			: (itemAmount?.form ?? titleForm ?? inferPackageForm(product.amount));
	const packageQuantity = product.amount
		? packageRemainder(product.amount, itemAmount?.matched)
		: undefined;
	const nameWithoutAmount = removeExact(sourceName, product.amount);
	const dose = product.potency?.trim()
		? conciseDose(product.potency)
		: conciseDose(nameWithoutAmount);
	const strippedName = stripFormVocabulary(nameWithoutAmount)
		.replace(DOSE_TOKEN_PATTERN, "")
		.replace(PACKAGE_MEASURE_PATTERN, "");
	const shortName =
		conciseShortName(strippedName) ||
		conciseShortName(removeBrandPrefix(product.name, product.brand));
	const details = [dose, form, itemAmount?.count, packageQuantity]
		.filter(Boolean)
		.join(", ");

	return {
		shortName,
		dose,
		form,
		count: itemAmount?.count,
		packageQuantity,
		accessibleName: bounded(
			[shortName, product.brand, details].filter(Boolean).join(", "),
			MAX_ACCESSIBLE_NAME,
		),
	};
};
