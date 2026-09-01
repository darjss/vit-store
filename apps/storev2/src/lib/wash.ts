export type Wash = "peach" | "blush" | "mint" | "sky" | "lilac" | "lemon" | "sage" | "apricot";

export const WASH_ORDER: Array<Wash> = [
	"peach",
	"blush",
	"mint",
	"sky",
	"lilac",
	"lemon",
	"sage",
	"apricot",
];

export const WASH_BG: Record<Wash, string> = {
	apricot: "bg-wash-apricot",
	blush: "bg-wash-blush",
	lemon: "bg-wash-lemon",
	lilac: "bg-wash-lilac",
	mint: "bg-wash-mint",
	peach: "bg-wash-peach",
	sage: "bg-wash-sage",
	sky: "bg-wash-sky",
};

export const WASH_VAR: Record<Wash, string> = {
	apricot: "var(--color-wash-apricot)",
	blush: "var(--color-wash-blush)",
	lemon: "var(--color-wash-lemon)",
	lilac: "var(--color-wash-lilac)",
	mint: "var(--color-wash-mint)",
	peach: "var(--color-wash-peach)",
	sage: "var(--color-wash-sage)",
	sky: "var(--color-wash-sky)",
};

export function washFor(key: string | number): Wash {
	const s = String(key);
	let h = 0;
	for (let i = 0; i < s.length; i++) {
		h = (h * 31 + s.charCodeAt(i)) >>> 0;
	}
	return WASH_ORDER[h % WASH_ORDER.length];
}

export function washBg(key: string | number): string {
	return WASH_BG[washFor(key)];
}

export function washVar(key: string | number): string {
	return WASH_VAR[washFor(key)];
}
