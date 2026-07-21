export interface SearchToken {
	kind: "dose" | "form" | "type";
	label: string;
}

const DOSE_RE = /(\d[\d,]*)\s*(iu|mg|mcg|g)\b/i;

const FORM_MAP: Record<string, string> = {
	softgel: "Softgel",
	capsule: "Capsule",
	tablet: "Tablet",
	powder: "Powder",
	gummy: "Gummy",
	шингэн: "Liquid",
};

const TYPE_MAP: Record<string, string> = {
	"vitamin d": "Vitamin D3",
	"vitamin c": "Vitamin C",
	omega: "Omega 3",
	magnesium: "Magnesium",
	магни: "Magnesium",
	collagen: "Collagen",
	protein: "Protein",
	zinc: "Zinc",
};

function formatDose(digits: string, unit: string): string {
	const numeric = Number.parseInt(digits.replace(/,/g, ""), 10);
	const grouped = Number.isNaN(numeric)
		? digits
		: numeric.toLocaleString("en-US");
	return `${grouped} ${unit.toUpperCase()}`;
}

export function parseSearchTokens(query: string): SearchToken[] {
	const normalized = query.toLowerCase();
	const tokens: SearchToken[] = [];

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
