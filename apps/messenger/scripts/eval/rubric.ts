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
		match: /vitamin c\b|\bc vitamin|vit c\b|витамин с\b|(?:^|\n)\s*c\s+(bga|bn|байгаа)/i,
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
	{
		keywords: ["glucosamine", "chondroitin", "msm"],
		match: /glucosamin|глюкозамин/i,
		name: "glucosamine",
	},
	{
		keywords: ["multivitamin", "multi", "one daily", "two-per-day"],
		match: /multivit|мультивитам|олон төрлийн аминдэм/i,
		name: "multivitamin",
	},
	{
		keywords: ["elderberry", "sambucus"],
		match: /elderber|элдербер|sambucus/i,
		name: "elderberry",
	},
	{
		keywords: ["coq10", "coq-10", "ubiquinol"],
		match: /coq ?10|ubiquinol|коэнзим/i,
		name: "coq10",
	},
	{
		keywords: ["b-complex", "b complex", "b-50", "b-100", "methyl b"],
		match: /\bb[\s-]?complex\b|б[\s-]?комплекс/i,
		name: "b_complex",
	},
	{
		keywords: ["lutein", "zeaxanthin", "eye", "vision", "ocuvite", "bilberry"],
		match: /lutein|лютеин|eye vitamin|нүдний витамин/i,
		name: "lutein",
	},
	{ keywords: ["nac", "n-acetyl"], match: /\bnac\b|n-acetyl/i, name: "nac" },
	{ keywords: ["turmeric", "curcumin"], match: /turmeric|curcumin|куркум/i, name: "turmeric" },
	{
		keywords: ["electrolyte", "hydration", "lmnt", "liquid i.v"],
		match: /electrolyt|электролит|hydration/i,
		name: "electrolyte",
	},
	{ keywords: ["glutathione"], match: /glutathion|глутатион/i, name: "glutathione" },
	{ keywords: ["ginkgo"], match: /ginkgo|гинко/i, name: "ginkgo" },
	{ keywords: ["boron"], match: /\bboron\b|борон/i, name: "boron" },
	{
		keywords: ["milk thistle", "silymarin", "liver"],
		match: /milk thistle|silymarin|элэгний|liver/i,
		name: "milk_thistle",
	},
	{ keywords: ["folate", "folic", "methylfolate"], match: /folat|folic|фолийн/i, name: "folate" },
	{ keywords: ["psyllium", "fiber", "metamucil"], match: /psyllium|fiber|эслэг/i, name: "fiber" },
	{ keywords: ["protein", "whey", "casein"], match: /protein|протеин|whey/i, name: "protein" },
	{ keywords: ["cranberry", "d-mannose"], match: /cranberr|цангис|d-mannose/i, name: "cranberry" },
	{ keywords: ["quercetin", "bromelain"], match: /quercetin|кверцетин/i, name: "quercetin" },
	{
		keywords: ["saw palmetto", "prostate"],
		match: /saw palmetto|түрүү булчирхай/i,
		name: "saw_palmetto",
	},
	{ keywords: ["iodine", "kelp", "lugol"], match: /\biodin|иод|kelp/i, name: "iodine" },
	{ keywords: ["potassium"], match: /potassium|кали\b/i, name: "potassium" },
	{ keywords: ["selenium"], match: /selen|селен/i, name: "selenium" },
	{ keywords: ["glycine", "theanine"], match: /glycin|глицин|theanin|теанин/i, name: "glycine" },
	{ keywords: ["lipoic"], match: /alpha lipoic|lipoic|липой/i, name: "alpha_lipoic" },
	{
		keywords: ["resveratrol", "nad", "nmn"],
		match: /resveratrol|ресвератрол|\bnad\+|\bnmn\b/i,
		name: "resveratrol",
	},
	{ keywords: ["colostrum"], match: /colostrum|уураг сүү/i, name: "colostrum" },
	{ keywords: ["chlorophyll"], match: /chlorophyll|хлорофилл/i, name: "chlorophyll" },
	{
		keywords: ["apple cider", "acv"],
		match: /apple cider|\bacv\b|алимны цуу/i,
		name: "apple_cider",
	},
	{ keywords: ["sea moss"], match: /sea moss/i, name: "sea_moss" },
	{ keywords: ["shilajit"], match: /shilajit|мумиё/i, name: "shilajit" },
	{ keywords: ["lysine"], match: /\bl-?lysine\b|л-?лизин(?!г)/i, name: "lysine" },
	{ keywords: ["taurine"], match: /taurin|таурин/i, name: "taurine" },
	{
		keywords: ["choline", "phosphatidyl", "lecithin"],
		match: /cholin|холин|lecithin|лецитин/i,
		name: "choline",
	},
	{
		keywords: ["enzyme", "digestive", "betaine"],
		match: /digestive enzyme|фермент|betaine/i,
		name: "enzyme",
	},
	{ keywords: ["garlic"], match: /garlic|сармис/i, name: "garlic" },
	{ keywords: ["maca"], match: /\bmaca\b|мака/i, name: "maca" },
	{ keywords: ["saffron"], match: /saffron|шафран/i, name: "saffron" },
	{ keywords: ["black seed", "nigella"], match: /black seed|хар гоньд/i, name: "black_seed" },
	{ keywords: ["oregano"], match: /oregano|орегано/i, name: "oregano" },
	{ keywords: ["beet"], match: /beet ?root|хүрэн манжин/i, name: "beet" },
	{ keywords: ["cherry"], match: /tart cherry/i, name: "tart_cherry" },
	{
		keywords: ["lion's mane", "lions mane", "mushroom", "reishi", "cordyceps"],
		match: /lion'?s mane|reishi|cordyceps|мөөг/i,
		name: "mushroom",
	},
	{
		keywords: ["vitamin a", "beta-carotene", "beta carotene"],
		match: /vitamin a\b|витамин а\b/i,
		name: "vitamin_a",
	},
	{ keywords: ["vitamin e", "tocopherol"], match: /vitamin e\b|витамин е\b/i, name: "vitamin_e" },
	{ keywords: ["hyaluronic"], match: /hyaluron|гиалурон/i, name: "hyaluronic" },
	{ keywords: ["astaxanthin"], match: /astaxanthin|астаксантин/i, name: "astaxanthin" },
	{ keywords: ["tudca"], match: /\btudca\b/i, name: "tudca" },
	{
		keywords: ["tongkat", "fadogia", "tribulus"],
		match: /tongkat|fadogia|tribulus/i,
		name: "tongkat",
	},
	{ keywords: ["iron", "ferritin"], match: /\bferritin\b|ферритин/i, name: "ferritin" },
] as const;

// Store-policy questions and what a correct reply must say (owner-approved
// facts in the plan 029 prompt). `expect` runs on the reply text.
export const FAQ_THEMES = [
	{
		expect: /6[,\s.]?000/,
		match:
			/hurgelt (hed\b|une)|hurgeltiin (une|mungu|tolbor)|хүргэлт (хэд\b|хэд вэ|үнэ)|хүргэлтийн (үнэ|төлбөр)/i,
		name: "delivery_fee",
	},
	{
		expect: /^(?![\s\S]*11 цаг)[\s\S]*(өнөөдөр|маргааш)/i,
		match: /hezee (hurge|ireh)|unuudur|onoodor|margaash|хэзээ (хүргэ|ирэх)|өнөөдөр|маргааш/i,
		name: "delivery_time",
	},
	{
		expect: /хүргэлтээр|очиж авах боломж(гүй| байхгүй)/i,
		match:
			/och(ij|ood) av|ooroo (irj|ochij)|irj avch|haana b(da|ai)g|хаана байдаг|оч(иж|оод) ав|ирж ав/i,
		name: "pickup",
	},
	{ expect: /байхгүй|боломжгүй|үгүй/i, match: /storepay|сторпэй|pocket|lendmn/i, name: "storepay" },
	{
		expect: /буцаа.*(байхгүй|боломжгүй|авдаггүй|үгүй)|(байхгүй|боломжгүй|авдаггүй|үгүй).*буцаа/is,
		match: /^(?!.*(butsaad bich|буцаад бич|даатгал)).*(butsaa|буцаа)/is,
		name: "returns",
	},
	{
		expect: /хямдрал.*(байхгүй|үгүй)|(байхгүй|үгүй).*хямдрал/is,
		match: /hymd|hyamd|хямд/i,
		name: "discount",
	},
	{
		expect: /унаа|такси/i,
		match:
			/oron nutag|\bh[ou]doo\b(?!\s+yav)|aimag|darhan|erdenet|орон нутаг|хөдөө(?!\s+яв)|аймаг|дархан|эрдэнэт/i,
		name: "countryside",
	},
	{
		expect: /жинхэнэ/i,
		match: /jinhene|original|orginal|huuramch|жинхэнэ|хуурамч/i,
		name: "authenticity",
	},
	{
		expect: /^(?![\s\S]*(?<!\d)[6-9]\d{3}[\s-]?\d{4}(?!\d))/,
		match:
			/(?<!дансны )дугаараа өг|dugaar(aa)? (ug|uguuch|өг)|утасны дугаар|zalgaj bolo|yariya|залгаж болох|ярья/i,
		name: "phone_request",
	},
] as const;

// Problems a human admin must take over (plan 029 handoff list).
export const HANDOFF_RE =
	/\b(ireegui|irsengui|buruu (ir|baraa)|gemteltei ir|hagarsan|gaali|tsutsal|admintai|hun b(na|ai)nu)|ирээгүй|ирсэнгүй|(^|\s)буруу (ир|бараа)|гэмтэлтэй ир|хагарсан|гааль|цуцал|zahialsan.*irsen|захиалсан.*ирсэн|админтай|хүн байна уу/i;

// Restock inquiries, SMS/code issues, and non-order uses of "ireegui" are not handoffs.
export const NOT_HANDOFF_RE =
	/мсж|смс|sms|msj|mesej|мессеж|код ирээгүй|kod ireegui|мэдэгдэл ирээгүй|менстрац|shineer ireegui|шинээр ирээгүй|түр тасарсан|(\d{3,5}\s*(tai|тай)?\s*d|omega|омега|витамин|vitamin|gummy\s*c?)\s*.{0,15}ireegui/i;

export const evalCaseSchema = v.object({
	expect: v.object({
		categories: v.optional(v.array(v.string())),
		countryside: v.optional(v.boolean()),
		faq: v.optional(v.string()),
		handoff: v.optional(v.boolean()),
		noCards: v.optional(v.boolean()),
		phone: v.optional(v.string()),
		searched: v.optional(v.boolean()),
	}),
	id: v.string(),
	kind: v.picklist(["clarify", "delivery", "faq", "handoff", "photo", "product"]),
	photos: v.optional(v.array(v.string())),
	// What the human admin actually answered: for reading results, never scored.
	reference: v.optional(v.string()),
	texts: v.array(v.string()),
});
export type EvalCase = v.InferOutput<typeof evalCaseSchema>;

// What the runner observed for one case.
// replyText is the model's own text part; fixed copy (cart summaries, order
// notices) is excluded so style checks judge only what the model wrote.
export type Observation = {
	checkoutAddress: string | null;
	checkoutCountryside: boolean | null;
	checkoutPhone: string | null;
	handoff: boolean;
	outcome: string;
	productNames: Array<string>;
	replyText: string;
	tools: Array<string>;
};

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const INTERNAL_LEAK_RE =
	/\b(search_products|product_details|cart_set|set_delivery|order_status|productIds|out_of_stock)\b|систем заалаа/i;

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
		style_no_internal_leak: !INTERNAL_LEAK_RE.test(text),
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

// Unlabeled verified product photos check search + showing cards; labeled photos
// (expect.categories set) verify the returned cards match the actual product.
const photoChecks = (c: EvalCase, o: Observation) =>
	c.expect.categories === undefined
		? { searched: o.tools.includes("search_products"), showed_cards: o.productNames.length > 0 }
		: productChecks(c, o);

// Non-product screenshots, stickers, price-only messages, and vague "Авья" turns
// must ask for clarification rather than hallucinating random catalog cards.
const clarifyChecks = (_c: EvalCase, o: Observation) => ({
	no_hallucinated_cards: o.productNames.length === 0,
	no_handoff: !o.handoff,
});

const faqChecks = (c: EvalCase, o: Observation) => {
	const theme = FAQ_THEMES.find((t) => t.name === c.expect.faq);
	return {
		correct_fact: o.replyText.length > 0 && theme !== undefined && theme.expect.test(o.replyText),
		no_handoff: !o.handoff,
	};
};

const deliveryChecks = (c: EvalCase, o: Observation) => {
	const base = {
		address_saved: o.checkoutAddress !== null && o.checkoutAddress.trim().length > 0,
		phone_saved: o.checkoutPhone === c.expect.phone,
		set_delivery: o.tools.includes("set_delivery"),
	};
	return c.expect.countryside === undefined
		? base
		: { ...base, countryside_match: o.checkoutCountryside === c.expect.countryside };
};

const handoffChecks = (_c: EvalCase, o: Observation) => ({ handed_off: o.handoff });

const KIND_CHECKS = {
	clarify: clarifyChecks,
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
