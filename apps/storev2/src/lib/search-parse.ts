export interface SearchToken {
	kind: "dose" | "form" | "type";
	label: string;
}

const DOSE_RE = /(\d[\d,]*)\s*(iu|mg|mcg|g)\b/i;

// oxlint-disable-next-line anti-slop/no-known-value-widening -- string-keyed lookup needs the open Record type
const FORM_MAP: Record<string, string> = {
	capsule: "Capsule",
	gummy: "Gummy",
	powder: "Powder",
	softgel: "Softgel",
	tablet: "Tablet",
	шингэн: "Liquid",
};

// oxlint-disable-next-line anti-slop/no-known-value-widening -- string-keyed lookup needs the open Record type
const TYPE_MAP: Record<string, string> = {
	collagen: "Collagen",
	magnesium: "Magnesium",
	omega: "Omega 3",
	protein: "Protein",
	"vitamin c": "Vitamin C",
	"vitamin d": "Vitamin D3",
	zinc: "Zinc",
	магни: "Magnesium",
};

function formatDose(digits: string, unit: string): string {
	const numeric = Number.parseInt(digits.replaceAll(",", ""), 10);
	const grouped = Number.isNaN(numeric) ? digits : numeric.toLocaleString("en-US");
	return `${grouped} ${unit.toUpperCase()}`;
}

export function parseSearchTokens(query: string): Array<SearchToken> {
	const normalized = query.toLowerCase();
	const tokens: Array<SearchToken> = [];

	for (const [keyword, label] of Object.entries(TYPE_MAP)) {
		if (normalized.includes(keyword)) {
			tokens.push({ kind: "type", label });
			break;
		}
	}

	const dose = DOSE_RE.exec(query);
	if (dose) {
		tokens.push({ kind: "dose", label: formatDose(dose[1], dose[2]) });
	}

	for (const [keyword, label] of Object.entries(FORM_MAP)) {
		if (normalized.includes(keyword)) {
			tokens.push({ kind: "form", label });
			break;
		}
	}

	return tokens;
}
