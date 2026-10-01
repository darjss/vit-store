// Eval rubric for the Messenger bot: case shape, labels derived from the real
// export, and the pass/fail checks. Everything that decides a score lives here.
import * as v from "valibot";

// Product categories customers ask about most (plan 029 data). `match` runs on
// the customer's text (Latin-script and Cyrillic), `keywords` on returned
// product names (lowercased). A product case passes when every matched
// category has at least one returned product whose name contains a keyword.
export const CATEGORIES = [
	{ keywords: ["magnesium"], match: /magn|магни/i, name: "magnesium" },
	{
		keywords: ["d3", "vitamin d"],
		match: /\bd3\b|\bd vit|vitamin d\b|\d{3,6} ?tai d\b|д витамин|\bд3\b/i,
		name: "vitamin_d",
	},
	{ keywords: ["k2"], match: /\bk2|\bк2/i, name: "k2" },
	{ keywords: ["zinc"], match: /zinc|tsair|цайр/i, name: "zinc" },
	{ keywords: ["omega", "fish oil", "krill"], match: /omega|омега|zagas|fish oil/i, name: "omega" },
	{ keywords: ["b12", "b-12", "methylcobalamin"], match: /\bb ?12\b|\bб ?12\b/i, name: "b12" },
	{ keywords: ["biotin"], match: /biotin|биотин/i, name: "biotin" },
	{ keywords: ["collagen"], match: /collag|kollag|коллаг/i, name: "collagen" },
	{
		keywords: ["vitamin c"],
		match: /vitamin c\b|\bc vitamin|vit c\b|витамин с\b/i,
		name: "vitamin_c",
	},
	{ keywords: ["iron"], match: /\biron\b|tumur|төмөр/i, name: "iron" },
	{ keywords: ["calcium"], match: /kalts|kalcium|calcium|кальци/i, name: "calcium" },
	{
		keywords: ["probiotic", "acidophilus", "lactobacillus", "akkermansia", "reuteri", "bifido"],
		match: /probiot|пробиот|ashigtai bak|ашигтай бактер/i,
		name: "probiotic",
	},
	{ keywords: ["melatonin"], match: /melaton|мелатон/i, name: "melatonin" },
	{ keywords: ["berberine"], match: /berberin|берберин/i, name: "berberine" },
	{ keywords: ["inositol"], match: /inositol|инозитол/i, name: "inositol" },
	{ keywords: ["creatine"], match: /creatin|креатин/i, name: "creatine" },
	{ keywords: ["ashwagandha"], match: /ashwagandha|ашваганда/i, name: "ashwagandha" },
	{ keywords: ["glucosamine"], match: /glucosamin|глюкозамин/i, name: "glucosamine" },
] as const;

// Store-policy questions and what a correct reply must say (owner-approved
// facts in the plan 029 prompt). `expect` runs on the reply text.
export const FAQ_THEMES = [
	{
		expect: /6[,\s.]?000/,
		match:
			/hurgelt (hed|une)|hurgeltiin (une|mungu|tolbor)|хүргэлт (хэд|үнэ)|хүргэлтийн (үнэ|төлбөр)/i,
		name: "delivery_fee",
	},
	{
		expect: /11|өнөөдөр|маргааш/i,
		match: /hezee (hurge|ireh)|unuudur|onoodor|margaash|хэзээ (хүргэ|ирэх)|өнөөдөр|маргааш/i,
		name: "delivery_time",
	},
	{
		expect: /хүргэлтээр|очиж авах боломж(гүй| байхгүй)/i,
		match: /ochij av|ooroo (irj|ochij)|irj avch|haana b(da|ai)g|хаана байдаг|очиж ав|ирж ав/i,
		name: "pickup",
	},
	{ expect: /байхгүй|боломжгүй|үгүй/i, match: /storepay|сторпэй|pocket|lendmn/i, name: "storepay" },
	{
		expect: /буцаа.*(байхгүй|боломжгүй|авдаггүй|үгүй)|(байхгүй|боломжгүй|авдаггүй|үгүй).*буцаа/is,
		match: /butsaa|буцаа/i,
		name: "returns",
	},
	{
		expect: /хямдрал.*(байхгүй|үгүй)|(байхгүй|үгүй).*хямдрал/is,
		match: /hymd|hyamd|хямд/i,
		name: "discount",
	},
	{
		expect: /унаа|такси/i,
		match: /oron nutag|\bh[ou]doo\b|aimag|darhan|erdenet|орон нутаг|хөдөө|аймаг|дархан|эрдэнэт/i,
		name: "countryside",
	},
	{
		expect: /жинхэнэ/i,
		match: /jinhene|original|orginal|huuramch|жинхэнэ|хуурамч/i,
		name: "authenticity",
	},
	{
		expect: /^(?![\s\S]*(?<!\d)[6-9]\d{3}[\s-]?\d{4}(?!\d))/,
		match: /dugaar(aa)? (ug|uguuch|өг)|утасны дугаар|zalgaj bolo|yariya|залгаж болох|ярья/i,
		name: "phone_request",
	},
] as const;

// Problems a human admin must take over (plan 029 handoff list).
export const HANDOFF_RE =
	/\b(ireegui|irsengui|buruu (ir|baraa)|gemteltei ir|hagarsan|gaali|tsutsal)|ирээгүй|(^|\s)буруу (ир|бараа)|гэмтэлтэй ир|хагарсан|гааль|цуцал|zahialsan.*irsen|захиалсан.*ирсэн/i;

// "ireegui" about a chat message or an SMS is not an order problem.
export const NOT_HANDOFF_RE = /мсж|смс|sms|msj|mesej|мессеж/i;

export const evalCaseSchema = v.object({
	expect: v.object({
		categories: v.optional(v.array(v.string())),
		faq: v.optional(v.string()),
		handoff: v.optional(v.boolean()),
		phone: v.optional(v.string()),
		searched: v.optional(v.boolean()),
	}),
	id: v.string(),
	kind: v.picklist(["delivery", "faq", "handoff", "photo", "product"]),
	photos: v.optional(v.array(v.string())),
	texts: v.array(v.string()),
});
export type EvalCase = v.InferOutput<typeof evalCaseSchema>;

// What the runner observed for one case.
// replyText is the model's own text part; fixed copy (cart summaries, order
// notices) is excluded so style checks judge only what the model wrote.
export type Observation = {
	checkoutPhone: string | null;
	handoff: boolean;
	outcome: string;
	productNames: Array<string>;
	replyText: string;
	tools: Array<string>;
};

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

// Lowercase Latin words that are units, not Latin-script Mongolian.
const UNITS = new Set(["iu", "kg", "mcg", "mg", "ml"]);

// Voice rules from the plan 029 prompt, applied to every reply. Brand and dose
// tokens are legitimately Latin, so the script check only fails a reply that
// has three or more lowercase Latin words ("bga", "hayag", "utsaa").
export const styleChecks = (text: string) => {
	const lowercaseLatin = new Set(
		(text.match(/[A-Za-z]+/g) ?? []).filter((w) => /^[a-z]{2,}$/.test(w) && !UNITS.has(w)),
	);
	return {
		style_cyrillic: lowercaseLatin.size < 3,
		style_max_one_emoji: (text.match(EMOJI_RE) ?? []).length <= 1,
		style_no_doctor_warning: !/эмч(тэй|ид)/i.test(text),
		style_no_markdown: !/\*\*|^#|^\s*[*•-]\s/m.test(text),
		style_short: text.length <= 300,
	};
};

const matchesCategory = (names: Array<string>, category: string): boolean => {
	const def = CATEGORIES.find((c) => c.name === category);
	if (def === undefined) {
		return false;
	}
	return names.some((n) => def.keywords.some((k) => n.toLowerCase().includes(k)));
};

const productChecks = (c: EvalCase, o: Observation) => ({
	right_product: (c.expect.categories ?? []).every((cat) => matchesCategory(o.productNames, cat)),
	searched: o.tools.includes("search_products"),
});

// Unlabeled photos only prove the model looked something up and showed cards.
const photoChecks = (c: EvalCase, o: Observation) =>
	c.expect.categories === undefined
		? { searched: o.tools.includes("search_products"), showed_cards: o.productNames.length > 0 }
		: productChecks(c, o);

const faqChecks = (c: EvalCase, o: Observation) => {
	const theme = FAQ_THEMES.find((t) => t.name === c.expect.faq);
	return {
		correct_fact: o.replyText.length > 0 && theme !== undefined && theme.expect.test(o.replyText),
		no_handoff: !o.handoff,
	};
};

const deliveryChecks = (c: EvalCase, o: Observation) => ({
	phone_saved: o.checkoutPhone === c.expect.phone,
	set_delivery: o.tools.includes("set_delivery"),
});

const handoffChecks = (_c: EvalCase, o: Observation) => ({ handed_off: o.handoff });

const KIND_CHECKS = {
	delivery: deliveryChecks,
	faq: faqChecks,
	handoff: handoffChecks,
	photo: photoChecks,
	product: productChecks,
} satisfies Record<EvalCase["kind"], (c: EvalCase, o: Observation) => object>;

export const score = (c: EvalCase, o: Observation) => {
	const replied = o.replyText.length > 0;
	const base = { ...KIND_CHECKS[c.kind](c, o), replied: replied || o.handoff };
	const checks = replied && c.kind !== "handoff" ? { ...base, ...styleChecks(o.replyText) } : base;
	return { checks, pass: Object.values(checks).every(Boolean) };
};
