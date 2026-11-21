// Builds a Messenger eval set from real conversations, from either source:
//   Zernio dumps (scripts/eval/pull-zernio.ts), the default:
//     bun scripts/eval/build-cases.ts [--zernio <dumpDir>] [--since <iso>] [--out path]
//   The page's Facebook export:
//     MESSENGER_EXPORT_DIR=<export>/this_profile's_activity_across_facebook/messages/inbox \
//       bun scripts/eval/build-cases.ts [--out path] [--seed n]
// Output contains real customer text: it goes to EVAL_DIR (outside the repo)
// and must never be committed.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as v from "valibot";
import { EVAL_DIR } from "./paths";
import { CATEGORIES, FAQ_THEMES, HANDOFF_RE, NOT_HANDOFF_RE, type EvalCase } from "./rubric";

const ADMIN = "Amerik huns baraa";
const REAL_PAGE = "6abf80aecb476a6db0a17892";
const KINDS = ["photo", "product", "faq", "delivery", "handoff", "clarify"] as const;
// A customer burst is consecutive incoming messages, no reply in between,
// within this window of its first message.
const BURST_MS = 3 * 60_000;

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (flag: string): boolean => process.argv.includes(flag);

const exportInbox = process.env.MESSENGER_EXPORT_DIR;
const source = exportInbox === undefined ? "zernio" : "export";
const seed = Number(arg("--seed") ?? "29");
const ubDate = (ms: number): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date(ms));
const since =
	arg("--since") === undefined
		? Date.parse(`${ubDate(Date.now() - 86_400_000)}T00:00:00+08:00`)
		: Date.parse(arg("--since") ?? "");
const out =
	arg("--out") ??
	join(EVAL_DIR, source === "zernio" ? `cases-zernio-${ubDate(Date.now())}.jsonl` : "cases.jsonl");
// Balanced defaults keep multi-week Zernio dumps crisp and fast to run;
// pass --all to emit every matching case.
const LIMITS: Record<(typeof KINDS)[number], number> = hasFlag("--all")
	? { clarify: 1000, delivery: 1000, faq: 1000, handoff: 1000, photo: 1000, product: 1000 }
	: source === "export"
		? { clarify: 10, delivery: 20, faq: 30, handoff: 15, photo: 16, product: 60 }
		: { clarify: 15, delivery: 25, faq: 25, handoff: 15, photo: 45, product: 40 };

// One customer turn: every text part of the burst plus its real photos, whether
// it opened the conversation (self-contained), and what the human admin answered.
type Burst = {
	opening: boolean;
	parts: Array<string>;
	photos: Array<string>;
	reference: string;
	stickers: number;
	t: number;
};

// ─── Photo sanity check (filters stickers downloaded in older Zernio dumps) ──

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const jpegDimensions = (buf: Buffer): { height: number; width: number } | undefined => {
	for (let offset = 2; offset + 9 < buf.length;) {
		if (buf[offset] !== 0xff) {
			return undefined;
		}
		const marker = buf[offset + 1];
		if (marker === undefined || marker === 0xd9 || marker === 0xda) {
			return undefined;
		}
		if (marker >= 0xc0 && marker <= 0xc2) {
			return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
		}
		const length = buf.readUInt16BE(offset + 2);
		if (length < 2) {
			return undefined;
		}
		offset += 2 + length;
	}
	return undefined;
};

const imageDimensions = (buf: Buffer): { height: number; width: number } | undefined => {
	if (buf.length >= 24 && buf.subarray(0, 4).equals(PNG_SIG)) {
		return { height: buf.readUInt32BE(20), width: buf.readUInt32BE(16) };
	}
	if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
		return jpegDimensions(buf);
	}
	return undefined;
};

// Facebook Messenger's thumbs-up sticker downloads as a 72x72 PNG (5,428 B) or
// 72x72 JPEG (1,678 B). Real product photos are much larger.
const isRealPhoto = (filePath: string): boolean => {
	if (!existsSync(filePath)) {
		return false;
	}
	const size = statSync(filePath).size;
	if (size < 8000) {
		return false;
	}
	const dims = imageDimensions(readFileSync(filePath));
	if (dims !== undefined && dims.width <= 160 && dims.height <= 160) {
		return false;
	}
	return true;
};

const photoFingerprint = (filePath: string): string => {
	const buf = readFileSync(filePath);
	return `${buf.length}:${buf.subarray(0, 64).toString("hex")}:${buf.subarray(-32).toString("hex")}`;
};

// ─── Facebook export loader ─────────────────────────────────────────────────

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

const loadExportConversation = (inbox: string, dir: string): Array<Msg> => {
	const exportRoot = join(inbox, "..", "..", "..");
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

// ─── Zernio dump loader ─────────────────────────────────────────────────────

const dumpSchema = v.object({
	id: v.string(),
	messages: v.array(
		v.object({
			at: v.string(),
			direction: v.picklist(["incoming", "outgoing"]),
			id: v.string(),
			photos: v.array(v.string()),
			text: v.string(),
		}),
	),
	updatedTime: v.string(),
});

const loadZernioConversation = (file: string): Array<Msg> =>
	v.parse(dumpSchema, JSON.parse(readFileSync(file, "utf8"))).messages.map((m) => ({
		admin: m.direction === "outgoing",
		photos: m.photos,
		t: Date.parse(m.at),
		text: m.text,
	}));

// ─── Bursts ─────────────────────────────────────────────────────────────────

// Page auto-replies and Facebook system notices are not anyone's real words.
const GREETING_RE =
	/^hi, thanks for contacting us|call now for faster service|bid tanii asuultand udahgui|ta asuuh zuilee uldeeg|replied to a post|^you (can call|missed a call)|^.{0,60} (missed your call|called you)/i;

const appendPhotos = (burst: Burst, photos: Array<string>, text: string): void => {
	for (const p of photos) {
		if (isRealPhoto(p)) {
			burst.photos.push(p);
		} else {
			burst.stickers += 1;
			if (!text.includes("[стикер]")) {
				burst.parts.push("[стикер]");
			}
		}
	}
};

const toBursts = (msgs: Array<Msg>): Array<Burst> => {
	const bursts: Array<Burst> = [];
	let current: Burst | undefined;
	let seenAdmin = false;
	for (const m of msgs) {
		if (!m.admin && GREETING_RE.test(m.text)) {
			continue;
		}
		if (m.admin) {
			seenAdmin = true;
			if (current !== undefined && !GREETING_RE.test(m.text) && m.text.length > 0) {
				current.reference = current.reference ? `${current.reference}\n${m.text}` : m.text;
			}
			if (current !== undefined && current.reference.length > 0) {
				current = undefined;
			}
			continue;
		}
		if (current === undefined || current.reference.length > 0 || m.t - current.t > BURST_MS) {
			current = { opening: !seenAdmin, parts: [], photos: [], reference: "", stickers: 0, t: m.t };
			bursts.push(current);
		}
		if (m.text.length > 0) {
			current.parts.push(m.text);
		}
		appendPhotos(current, m.photos, m.text);
	}
	return bursts;
};

// The export keeps one message per case (its labels were tuned that way);
// Zernio cases replay whole bursts, as the bot receives them.
const conversations: Array<Array<Burst>> = [];
if (exportInbox !== undefined) {
	for (const folder of readdirSync(exportInbox)) {
		const msgs = loadExportConversation(exportInbox, join(exportInbox, folder));
		conversations.push(
			msgs.flatMap((m, i) => {
				if (m.admin) {
					return [];
				}
				// Export photo messages carry no text: pair them with the next message.
				const next = msgs[i + 1];
				const parts =
					m.photos.length > 0 && next !== undefined && !next.admin ? [next.text] : [m.text];
				const photos = m.photos.filter(isRealPhoto);
				return [{ opening: i === 0, parts, photos, reference: "", stickers: 0, t: m.t }];
			}),
		);
	}
} else {
	const dumpDir = arg("--zernio") ?? join(EVAL_DIR, "zernio", REAL_PAGE);
	if (!existsSync(dumpDir)) {
		console.error(`No Zernio dump at ${dumpDir}. Run scripts/eval/pull-zernio.ts first.`);
		process.exit(1);
	}
	for (const file of readdirSync(dumpDir).filter((f) => f.endsWith(".json"))) {
		conversations.push(
			toBursts(loadZernioConversation(join(dumpDir, file))).filter((b) => b.t >= since),
		);
	}
}

// ─── Labeling ───────────────────────────────────────────────────────────────

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
const PHONE_RE_G = /(?<!\d)([6-9]\d{3})[\s-]?(\d{4})(?!\d)/g;
const ADDRESS_RE =
	/horoo|horoolol|hothon|bair|toot|duureg|dvvreg|хороо|хороолол|хотхон|байр|тоот|дүүрэг/i;
const COUNTRYSIDE_RE =
	/oron nutag|\bh[ou]doo\b|aimag|darhan|erdenet|орон нутаг|хөдөө|аймаг|дархан|эрдэнэт|\bsum\b|сум\b|унаанд/i;
const ASKS_ABOUT_PRODUCT_RE =
	/bga|bn[au]|bai|байгаа|байна уу|hed|хэд|une|үнэ|av[iy]|авъя|авья|авий/i;
const BARE_BUY_RE =
	/^[\s.,!?]*(за|za|ok|ок)?[\s.,!?]*(авъя|авъяа|авья|авий|avya|aviy|avii)[\s.,!?]*$/i;
const NON_PRODUCT_PHOTO_RE =
	/link|линк|\.mn\b|https?:|barimt|баримт|qpay|гүйлгээ|guilgee|call me in messenger|хаяг|hayag|tdb|khan bank|хаан банк|голомт|golomt|системийн шинэчлэл|sesteemiin shinechlel|🚌|автобус/i;
const RECEIPT_RE = /barimt|баримт|qpay|гүйлгээ|guilgee|shiljuul|шилжүүл|tdb|хаан банк|голомт/i;
const NEGATION_RE =
	/daraa bol|дараа бол|hasaa|хас|hereggui|хэрэггүй|bolich|больч|avahgui|авахгүй|uur gazraas awch|өөр газраас авч/i;
const MID_THREAD_REF_RE = /^\s*(нөгөө|nuguu|тэрний|ternii|энэний|enenii)\b/i;
const PRICE_ONLY_RE =
	/^[\s.,!?]*(\d{2,3}[kк]?|\d{2,3}[\s-]?(iin|ийн|тай|tai|нь))(\s*(bga|bn[au]|av[iy]|байгаа|байна уу|авъя|авья|хэд))?[\s.,!?]*$/i;
const MAX_TEXT = source === "export" ? 160 : 300;
// "Where do I send the money" is a payment question even when it names a product.
const PAYMENT_RE = /mung|мөнгө|\bdans|данс|shiljuul|шилжүүл|tulbur|tolbor|төлбөр/i;

const fakePhone = (index: number): string => `9911${String(1000 + index).slice(-4)}`;

const pools = {
	clarify: new Array<EvalCase>(),
	delivery: new Array<EvalCase>(),
	faq: new Array<EvalCase>(),
	handoff: new Array<EvalCase>(),
	photo: new Array<EvalCase>(),
	product: new Array<EvalCase>(),
} satisfies Record<(typeof KINDS)[number], Array<EvalCase>>;
const seen = new Set<string>();
const seenPhotos = new Set<string>();
let counter = 0;

for (const bursts of conversations) {
	for (const b of bursts) {
		const text = b.parts.join("\n");
		const key = text.toLowerCase();
		const reference = b.reference || undefined;
		const categories = CATEGORIES.filter((c) => c.match.test(text)).map((c) => c.name);
		if (b.photos.length > 0) {
			const firstPhoto = b.photos[0] ?? "";
			const fp = photoFingerprint(firstPhoto);
			if (seenPhotos.has(fp)) {
				continue;
			}
			// Non-product screenshots (expired domain links, address screenshots — not bank
			// transfer receipts or messages naming a product) belong in `clarify`.
			if (
				NON_PRODUCT_PHOTO_RE.test(text) &&
				categories.length === 0 &&
				!RECEIPT_RE.test(text) &&
				!PHONE_RE.test(text) &&
				!HANDOFF_RE.test(text) &&
				!text.toLowerCase().includes("call me in messenger") &&
				!/🚌|автобус/i.test(text)
			) {
				seenPhotos.add(fp);
				pools.clarify.push({
					expect: { noCards: true },
					id: `clarify_${counter++}`,
					kind: "clarify",
					photos: [firstPhoto],
					reference,
					texts: b.parts,
				});
				continue;
			}
			// A real product photo with either an opening turn or an explicit product question.
			const asksAboutProduct =
				(source === "zernio" || /ene|энэ/i.test(text)) &&
				ASKS_ABOUT_PRODUCT_RE.test(text) &&
				!BARE_BUY_RE.test(text);
			if (
				(b.opening || asksAboutProduct) &&
				!PHONE_RE.test(text) &&
				!ADDRESS_RE.test(text) &&
				!COUNTRYSIDE_RE.test(text) &&
				!PAYMENT_RE.test(text) &&
				!NON_PRODUCT_PHOTO_RE.test(text) &&
				!NEGATION_RE.test(text) &&
				!HANDOFF_RE.test(text)
			) {
				seenPhotos.add(fp);
				pools.photo.push({
					expect: categories.length > 0 ? { categories } : { searched: true },
					id: `photo_${counter++}`,
					kind: "photo",
					photos: [firstPhoto],
					reference,
					texts: b.parts,
				});
			}
			continue;
		}
		if (text.length < 3 || text.length > MAX_TEXT || seen.has(key)) {
			continue;
		}
		seen.add(key);
		if (HANDOFF_RE.test(text) && !NOT_HANDOFF_RE.test(text) && !PHONE_RE.test(text)) {
			pools.handoff.push({
				expect: { handoff: true },
				id: `handoff_${counter++}`,
				kind: "handoff",
				reference,
				texts: b.parts,
			});
			continue;
		}
		const phone = PHONE_RE.exec(text);
		const isCountryside = COUNTRYSIDE_RE.test(text);
		if (phone !== null && (ADDRESS_RE.test(text) || isCountryside)) {
			const fake = fakePhone(counter);
			const masked = `${fake.slice(0, 4)} ${fake.slice(4)}`;
			pools.delivery.push({
				expect: { countryside: isCountryside, phone: fake },
				id: `delivery_${counter++}`,
				kind: "delivery",
				texts: b.parts.map((p) => p.replaceAll(PHONE_RE_G, masked)),
			});
			continue;
		}
		if (phone !== null) {
			continue;
		}
		// Ambiguous policy questions (two themes at once) carry no clean label.
		const themes = FAQ_THEMES.filter((t) => t.match.test(text));
		const theme = themes.length === 1 ? themes[0] : undefined;
		if (
			theme !== undefined &&
			categories.length === 0 &&
			!ADDRESS_RE.test(text) &&
			!PAYMENT_RE.test(text)
		) {
			pools.faq.push({
				expect: { faq: theme.name },
				id: `faq_${counter++}`,
				kind: "faq",
				reference,
				texts: b.parts,
			});
			continue;
		}
		// Price-only or sticker+buy turns with no product mentioned: bot must ask, not hallucinate.
		const textNoSticker = b.parts
			.filter((p) => p !== "[стикер]")
			.join(" ")
			.trim();
		if (
			categories.length === 0 &&
			themes.length === 0 &&
			!HANDOFF_RE.test(text) &&
			!PAYMENT_RE.test(text) &&
			!RECEIPT_RE.test(text) &&
			(PRICE_ONLY_RE.test(textNoSticker) ||
				(b.stickers > 0 && ASKS_ABOUT_PRODUCT_RE.test(textNoSticker)))
		) {
			pools.clarify.push({
				expect: { noCards: true },
				id: `clarify_${counter++}`,
				kind: "clarify",
				reference,
				texts: b.parts,
			});
			continue;
		}
		if (
			categories.length > 0 &&
			themes.length === 0 &&
			!HANDOFF_RE.test(text) &&
			!PAYMENT_RE.test(text) &&
			!NEGATION_RE.test(text) &&
			(b.opening || !MID_THREAD_REF_RE.test(text))
		) {
			pools.product.push({
				expect: { categories },
				id: `product_${counter++}`,
				kind: "product",
				reference,
				texts: b.parts,
			});
		}
	}
}

const cases: Array<EvalCase> = [];
if (exportInbox !== undefined) {
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
	cases.push(
		...LABELED_PHOTOS.map((p, i) => ({
			expect: { categories: p.categories },
			id: `photo_labeled_${i}`,
			kind: "photo" as const,
			photos: [join(exportInbox, p.file)],
			texts: [p.text],
		})),
	);
}
// Round-robin stratified sample so rare buckets (countryside delivery,
// non-delivery_time FAQ themes) are guaranteed coverage instead of drowned out.
const sampleStratified = (
	items: Array<EvalCase>,
	limit: number,
	rand: () => number,
	bucket: (c: EvalCase) => string,
): Array<EvalCase> => {
	const groups = new Map<string, Array<EvalCase>>();
	for (const item of shuffle(items, rand)) {
		const key = bucket(item);
		const list = groups.get(key) ?? [];
		list.push(item);
		groups.set(key, list);
	}
	const picked: Array<EvalCase> = [];
	const keys = [...groups.keys()].toSorted();
	for (let round = 0; picked.length < limit; round += 1) {
		let added = false;
		for (const key of keys) {
			const item = groups.get(key)?.[round];
			if (item !== undefined && picked.length < limit) {
				picked.push(item);
				added = true;
			}
		}
		if (!added) {
			break;
		}
	}
	return picked;
};

const rand = mulberry32(seed);
for (const kind of KINDS) {
	if (kind === "faq") {
		cases.push(...sampleStratified(pools.faq, LIMITS.faq, rand, (c) => c.expect.faq ?? "other"));
	} else if (kind === "delivery") {
		cases.push(
			...sampleStratified(pools.delivery, LIMITS.delivery, rand, (c) =>
				c.expect.countryside === true ? "countryside" : "ub",
			),
		);
	} else {
		cases.push(...shuffle(pools[kind], rand).slice(0, LIMITS[kind]));
	}
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
console.log(
	JSON.stringify({
		out,
		pools: Object.fromEntries(Object.entries(pools).map(([k, list]) => [k, list.length])),
		source,
		written: cases.length,
	}),
);
