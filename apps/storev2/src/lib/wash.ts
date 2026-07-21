export type Wash =
	| "peach"
	| "blush"
	| "mint"
	| "sky"
	| "lilac"
	| "lemon"
	| "sage"
	| "apricot";

export const WASH_ORDER: Wash[] = [
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
	peach: "bg-wash-peach",
	blush: "bg-wash-blush",
	mint: "bg-wash-mint",
	sky: "bg-wash-sky",
	lilac: "bg-wash-lilac",
	lemon: "bg-wash-lemon",
	sage: "bg-wash-sage",
	apricot: "bg-wash-apricot",
};

export const WASH_VAR: Record<Wash, string> = {
	peach: "var(--color-wash-peach)",
	blush: "var(--color-wash-blush)",
	mint: "var(--color-wash-mint)",
	sky: "var(--color-wash-sky)",
	lilac: "var(--color-wash-lilac)",
	lemon: "var(--color-wash-lemon)",
	sage: "var(--color-wash-sage)",
	apricot: "var(--color-wash-apricot)",
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
