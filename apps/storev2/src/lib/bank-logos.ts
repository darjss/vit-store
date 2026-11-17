import { lookup } from "@vit/shared/lookup";

type BankId =
	| "ard"
	| "arig"
	| "bogd"
	| "capitron"
	| "chinggis"
	| "happypay"
	| "hipay"
	| "khaan"
	| "mbank"
	| "monpay"
	| "most"
	| "nib"
	| "payon"
	| "qpay"
	| "socialpay"
	| "sono"
	| "state"
	| "tdb"
	| "tino"
	| "toki"
	| "transbank"
	| "xac";

/**
 * QPay deeplink banks, keyed by the lowercased `name` or `description` QPay
 * returns (copied verbatim from a real invoice's `urls[]`).
 *
 * QPay hotlinks bank logos from their CDN and most of them break in
 * production, so mapped banks resolve to local assets in `/public/banks/`.
 * Unmapped entries fall back to the remote `logo` URL, then to the generic icon.
 */
const BANK_ALIASES = {
	// "qPay wallet" / "qPay хэтэвч"
	qpay: "qpay",
	"qpay wallet": "qpay",
	"qpay хэтэвч": "qpay",
	// "Khan bank" / "Хаан банк"
	khan: "khaan",
	"khan bank": "khaan",
	"хаан банк": "khaan",
	// "Xac bank" / "Хас банк"
	xac: "xac",
	"xac bank": "xac",
	"хас банк": "xac",
	// "State bank 3.0" / "Төрийн банк 3.0"
	state: "state",
	"state bank": "state",
	"state bank 3.0": "state",
	"төрийн банк": "state",
	"төрийн банк 3.0": "state",
	// "Trade and Development bank" / "TDB online"
	tdb: "tdb",
	"tdb online": "tdb",
	"trade and development bank": "tdb",
	// "Social Pay" / "Голомт банк"
	socialpay: "socialpay",
	"social pay": "socialpay",
	голомт: "socialpay",
	"голомт банк": "socialpay",
	// "Most money" / "МОСТ мони"
	most: "most",
	"most money": "most",
	// "National investment bank" / "Үндэсний хөрөнгө оруулалтын банк"
	"national investment bank": "nib",
	nib: "nib",
	"үндэсний хөрөнгө оруулалтын банк": "nib",
	// "Chinggis khaan bank" / "Чингис Хаан банк"
	chinggis: "chinggis",
	"chinggis khaan bank": "chinggis",
	"чингис хаан банк": "chinggis",
	// "Capitron bank" / "Капитрон банк"
	capitron: "capitron",
	"capitron bank": "capitron",
	"капитрон банк": "capitron",
	// "Bogd bank" / "Богд банк"
	bogd: "bogd",
	"bogd bank": "bogd",
	"богд банк": "bogd",
	// "Trans bank" / "Тээвэр хөгжлийн банк"
	transbank: "transbank",
	"trans bank": "transbank",
	"тээвэр хөгжлийн банк": "transbank",
	// "M bank" / "М банк"
	mbank: "mbank",
	"m bank": "mbank",
	"м банк": "mbank",
	// "Ard App" / "Ард Апп"
	ard: "ard",
	"ard app": "ard",
	"ард апп": "ard",
	// "Toki App" / "Toki App"
	toki: "toki",
	"toki app": "toki",
	// "Arig bank" / "Ариг банк"
	arig: "arig",
	"arig bank": "arig",
	"ариг банк": "arig",
	// "Monpay" / "Мон Пэй"
	monpay: "monpay",
	"мон пэй": "monpay",
	// "Hipay" / "Hipay"
	hipay: "hipay",
	// "Happy Pay" / "Happy Pay MN"
	happypay: "happypay",
	"happy pay": "happypay",
	"happy pay mn": "happypay",
	// "Sono" / "Sono"
	sono: "sono",
	// "PayOn" / "PayOn"
	payon: "payon",
	// "Tino" / "Tino"
	tino: "tino",
} satisfies Record<string, BankId>;

type BankLink = { description: string; name: string };

const normalize = (value?: string) => value?.trim().toLowerCase() ?? "";

const resolveBank = (name?: string, description?: string) =>
	lookup(BANK_ALIASES, normalize(name)) ?? lookup(BANK_ALIASES, normalize(description));

export function resolveBankLogo(name?: string, description?: string) {
	const bank = resolveBank(name, description);
	if (!bank) {
		return null;
	}
	return bank === "nib" ? "/banks/nib.jpeg" : `/banks/${bank}.png`;
}

// Order from PostHog bank taps on /payment: Khan leads by 4x, then the four
// that reliably hand off. Sono and the qPay wallet rarely open, so they sit
// with the rest under "other".
const FEATURED_BANKS = ["tdb", "socialpay", "xac", "state"] satisfies Array<BankId>;

/**
 * Splits QPay's deeplinks into the Khan hero, the featured grid and the rest.
 * A featured bank missing from the invoice is skipped. Inside Facebook's
 * in-app browser the qPay wallet never hands off, so it is dropped.
 */
export function rankBankLinks<TLink extends BankLink>(links: Array<TLink>, inAppBrowser: string) {
	const ranked = links
		.map((link) => ({ bank: resolveBank(link.name, link.description), link }))
		.filter(({ bank }) => !(bank === "qpay" && inAppBrowser === "facebook"));
	const take = (bank: BankId) => {
		const index = ranked.findIndex((entry) => entry.bank === bank);
		return index === -1 ? [] : ranked.splice(index, 1).map(({ link }) => link);
	};
	const [hero] = take("khaan");
	const featured = FEATURED_BANKS.flatMap(take);
	return { featured, hero, others: ranked.map(({ link }) => link) };
}
