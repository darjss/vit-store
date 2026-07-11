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
	accessibleName: string;
}

const DOSE_PATTERN =
	/\b\d[\d,.]*(?:\s*)(?:mcg|μg|мкг|mg|мг|g|гр|kg|кг|ml|мл|l|л|iu|оу(?:н)?|cfu|billion)\b/giu;
const AMOUNT_PATTERN =
	/\b\d[\d,.]*\s*(?:softgels?|capsules?|caps?|tablets?|gummies?|chewables?|servings?|packets?|sachets?|drops?|pieces?|count|ширхэг|капсул|шахмал|гами|тун|уут|дусал)\b/giu;
const FORM_PATTERN =
	/(?:softgels?|capsules?|caps?|tablets?|gummies?|chewables?|servings?|packets?|sachets?|drops?|powder|liquid|pieces?|count|ширхэг|зөөлөн\s+капсул|капсул|шахмал|гами|тун|уут|дусал|нунтаг|шингэн)/iu;

const FORM_LABELS: Array<[RegExp, string]> = [
	[/softgels?/iu, "Зөөлөн капсул"],
	[/capsules?|caps?|капсул/iu, "Капсул"],
	[/tablets?|шахмал/iu, "Шахмал"],
	[/gummies?|chewables?|гами/iu, "Гами"],
	[/servings?|тун/iu, "Тун"],
	[/packets?|sachets?|уут/iu, "Уут"],
	[/drops?|дусал/iu, "Дусал"],
	[/powder|нунтаг/iu, "Нунтаг"],
	[/liquid|шингэн/iu, "Шингэн"],
	[/pieces?|count|ширхэг/iu, "Ширхэг"],
];

const clean = (value: string) =>
	value
		.replace(/\s*[,|•·]\s*/gu, " ")
		.replace(/\s*\+\s*(?=$)/gu, "")
		.replace(/(^|\s)\+(?=\s|$)/gu, " ")
		.replace(/\s{2,}/gu, " ")
		.trim();

const removeBrandPrefix = (name: string, brand?: string | null) => {
	const brandKey = brand?.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
	if (!brandKey) return name;

	let prefixKey = "";
	for (let index = 0; index < name.length; index += 1) {
		prefixKey += name[index].toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
		if (!brandKey.startsWith(prefixKey)) return name;
		if (prefixKey === brandKey) return name.slice(index + 1).trim();
	}
	return name;
};

const uniqueMatches = (value: string, pattern: RegExp) => [
	...new Set(value.match(pattern)?.map((match) => match.trim()) ?? []),
];

const amountParts = (amount: string) => {
	const count = amount.match(/\d[\d,.]*/u)?.[0];
	const rawForm = amount.match(FORM_PATTERN)?.[0];
	const form = rawForm
		? (FORM_LABELS.find(([pattern]) => pattern.test(rawForm))?.[1] ?? rawForm)
		: undefined;
	return { count, form };
};

/**
 * Projects imported catalog text into the compact, non-redundant labels used
 * by every storefront product card. The imported `name` remains untouched for
 * PDP/source accuracy; `nameMn` is preferred only for the card's short title.
 */
export const projectProductCardDisplay = (
	product: ProductCardDisplayInput,
): ProductCardDisplay => {
	const sourceName = removeBrandPrefix(
		product.nameMn?.trim() || product.name,
		product.brand,
	);
	const amountSource =
		product.amount?.trim() ||
		uniqueMatches(sourceName, AMOUNT_PATTERN)[0] ||
		"";
	const { count, form } = amountParts(amountSource);
	const dose =
		product.potency?.trim() ||
		uniqueMatches(sourceName, DOSE_PATTERN).join(" + ") ||
		undefined;
	const shortName =
		clean(sourceName.replace(AMOUNT_PATTERN, "").replace(DOSE_PATTERN, "")) ||
		clean(removeBrandPrefix(product.name, product.brand));
	const details = [dose, form, count].filter(Boolean).join(", ");

	return {
		shortName,
		dose,
		form,
		count,
		accessibleName: [shortName, product.brand, details]
			.filter(Boolean)
			.join(", "),
	};
};
