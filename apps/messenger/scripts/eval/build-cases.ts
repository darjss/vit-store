// Builds the Messenger eval set from the page's Facebook export.
// Usage: MESSENGER_EXPORT_DIR=<export>/this_profile's_activity_across_facebook/messages/inbox \
//   bun scripts/eval/build-cases.ts [--out path] [--seed n]
// Output contains real customer text: it goes to the gitignored
// messenger-chat-history/eval/ folder at the repo root and must never be committed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as v from "valibot";
import { CATEGORIES, FAQ_THEMES, HANDOFF_RE, NOT_HANDOFF_RE, type EvalCase } from "./rubric";

const ADMIN = "Amerik huns baraa";
const LIMITS = { delivery: 20, faq: 30, handoff: 15, photo: 16, product: 60 } as const;
const KINDS = ["photo", "product", "faq", "delivery", "handoff"] as const;

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};

const inbox = process.env.MESSENGER_EXPORT_DIR;
if (!inbox) {
	console.error("Set MESSENGER_EXPORT_DIR to the export's messages/inbox folder.");
	process.exit(1);
}
const exportRoot = join(inbox, "..", "..", "..");
const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");
const out = arg("--out") ?? join(repoRoot, "messenger-chat-history", "eval", "cases.jsonl");
const seed = Number(arg("--seed") ?? "29");

// Facebook exports store UTF-8 bytes as latin1 code points.
const fix = (s: string | undefined): string =>
	s === undefined ? "" : Buffer.from(s, "latin1").toString("utf8");

const exportMessageSchema = v.looseObject({
	content: v.optional(v.string()),
	photos: v.optional(v.array(v.looseObject({ uri: v.string() }))),
	sender_name: v.optional(v.string()),
	timestamp_ms: v.optional(v.number()),
});
const exportFileSchema = v.looseObject({ messages: v.optional(v.array(exportMessageSchema)) });

type Msg = { admin: boolean; photos: Array<string>; t: number; text: string };

const loadConversation = (dir: string): Array<Msg> => {
	const files = readdirSync(dir).filter((f) => /^message_\d+\.json$/.test(f));
	const msgs: Array<Msg> = [];
	for (const file of files) {
		const parsed = v.safeParse(exportFileSchema, JSON.parse(readFileSync(join(dir, file), "utf8")));
		if (!parsed.success) {
			continue;
		}
		for (const m of parsed.output.messages ?? []) {
			msgs.push({
				admin: fix(m.sender_name) === ADMIN,
				photos: (m.photos ?? []).map((p) => join(exportRoot, p.uri)),
				t: m.timestamp_ms ?? 0,
				text: fix(m.content).trim(),
			});
		}
	}
	return msgs.sort((a, b) => a.t - b.t);
};

// Deterministic shuffle so the same seed always yields the same eval set.
const mulberry32 = (start: number) => {
	let a = start;
	return () => {
		a = (a + 0x6d_2b_79_f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
};
const shuffle = <T>(items: Array<T>, rand: () => number): Array<T> => {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
};

const PHONE_RE = /(?<!\d)([6-9]\d{3})[\s-]?(\d{4})(?!\d)/;
const ADDRESS_RE =
	/horoo|horoolol|hothon|bair|toot|duureg|dvvreg|хороо|хороолол|хотхон|байр|тоот|дүүрэг/i;
const GREETING_RE = /^hi, thanks for contacting us|call now for faster service/i;

const fakePhone = (index: number): string => `9911${String(1000 + index).slice(-4)}`;

const pools = {
	delivery: new Array<EvalCase>(),
	faq: new Array<EvalCase>(),
	handoff: new Array<EvalCase>(),
	photo: new Array<EvalCase>(),
	product: new Array<EvalCase>(),
};
const seen = new Set<string>();
let counter = 0;

for (const folder of readdirSync(inbox)) {
	const msgs = loadConversation(join(inbox, folder)).filter(
		(m) => !(m.admin && GREETING_RE.test(m.text)),
	);
	for (const [i, m] of msgs.entries()) {
		if (m.admin) {
			continue;
		}
		const text = m.text;
		const key = text.toLowerCase();
		if (m.photos.length > 0) {
			// A product photo followed by the customer's question in the same turn.
			const next = msgs[i + 1];
			const question = next !== undefined && !next.admin ? next.text : "";
			const asksAboutProduct =
				/ene|энэ/i.test(question) &&
				/bga|bn[au]|bai|байгаа|байна уу|hed|хэд|une|үнэ|av[iy]|авъя|авья|авий/i.test(question);
			if (asksAboutProduct && !PHONE_RE.test(question) && !ADDRESS_RE.test(question)) {
				pools.photo.push({
					expect: { searched: true },
					id: `photo_${counter++}`,
					kind: "photo",
					photos: [m.photos[0]],
					texts: [question],
				});
			}
			continue;
		}
		if (text.length < 3 || text.length > 160 || seen.has(key)) {
			continue;
		}
		seen.add(key);
		if (HANDOFF_RE.test(text) && !NOT_HANDOFF_RE.test(text) && !PHONE_RE.test(text)) {
			pools.handoff.push({
				expect: { handoff: true },
				id: `handoff_${counter++}`,
				kind: "handoff",
				texts: [text],
			});
			continue;
		}
		const phone = PHONE_RE.exec(text);
		if (phone !== null && ADDRESS_RE.test(text)) {
			const fake = fakePhone(counter);
			pools.delivery.push({
				expect: { phone: fake },
				id: `delivery_${counter++}`,
				kind: "delivery",
				texts: [text.replace(PHONE_RE, `${fake.slice(0, 4)} ${fake.slice(4)}`)],
			});
			continue;
		}
		if (phone !== null) {
			continue;
		}
		// Ambiguous policy questions (two themes at once) carry no clean label.
		const themes = FAQ_THEMES.filter((t) => t.match.test(text));
		const theme = themes.length === 1 ? themes[0] : undefined;
		const categories = CATEGORIES.filter((c) => c.match.test(text)).map((c) => c.name);
		if (theme !== undefined && categories.length === 0) {
			pools.faq.push({
				expect: { faq: theme.name },
				id: `faq_${counter++}`,
				kind: "faq",
				texts: [text],
			});
			continue;
		}
		if (categories.length > 0 && themes.length === 0 && !HANDOFF_RE.test(text)) {
			pools.product.push({
				expect: { categories },
				id: `product_${counter++}`,
				kind: "product",
				texts: [text],
			});
		}
	}
}

// Four photos labeled by hand (viewed during plan 029): the right product category.
const LABELED_PHOTOS: Array<{ categories: Array<string>; file: string; text: string }> = [
	{
		categories: ["inositol"],
		file: "abuykaabuyka_2717021725363542/photos/26939191042352273.jpg",
		text: "Sn bnuu ene bga yu",
	},
	{
		categories: ["ashwagandha"],
		file: "aisalaagan_27035647199376496/photos/2429934224142852.jpg",
		text: "Ene bgaa yu",
	},
	{
		categories: ["glucosamine"],
		file: "aouuncimeg_1983923625776293/photos/1327190735988276.jpg",
		text: "Hi ene bnu? Tun n hedtei we",
	},
	{
		categories: ["probiotic"],
		file: "ariunselengedavaadorj_122138013350889958/photos/1689349175402551.jpg",
		text: "Ene 2 bga yu? Hed ve? Yund uudag ve?",
	},
];

const rand = mulberry32(seed);
const cases: Array<EvalCase> = LABELED_PHOTOS.map((p, i) => ({
	expect: { categories: p.categories },
	id: `photo_labeled_${i}`,
	kind: "photo" as const,
	photos: [join(inbox, p.file)],
	texts: [p.text],
}));
for (const kind of KINDS) {
	cases.push(...shuffle(pools[kind], rand).slice(0, LIMITS[kind]));
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
console.log(
	JSON.stringify({
		out,
		pools: Object.fromEntries(Object.entries(pools).map(([k, list]) => [k, list.length])),
		written: cases.length,
	}),
);
