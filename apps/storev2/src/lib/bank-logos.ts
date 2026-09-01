/**
 * Local logos for QPay deeplink banks.
 *
 * QPay hotlinks bank logos from their CDN and most of them break in
 * production, so mapped banks resolve to local assets instead. Assets live in
 * `/public/banks/`, harvested from a real invoice's `urls[]` (names and
 * descriptions below are copied verbatim from QPay's response). Unmapped
 * entries fall back to the remote `logo` URL, then to the generic icon.
 */
const BANK_LOGOS: Record<string, string> = {
	// "qPay wallet" / "qPay хэтэвч"
	qpay: "/banks/qpay.png",
	"qpay wallet": "/banks/qpay.png",
	"qpay хэтэвч": "/banks/qpay.png",
	// "Khan bank" / "Хаан банк"
	khan: "/banks/khaan.png",
	"khan bank": "/banks/khaan.png",
	"хаан банк": "/banks/khaan.png",
	// "Xac bank" / "Хас банк"
	xac: "/banks/xac.png",
	"xac bank": "/banks/xac.png",
	"хас банк": "/banks/xac.png",
	// "State bank 3.0" / "Төрийн банк 3.0"
	state: "/banks/state.png",
	"state bank": "/banks/state.png",
	"state bank 3.0": "/banks/state.png",
	"төрийн банк": "/banks/state.png",
	// "Trade and Development bank" / "TDB online"
	tdb: "/banks/tdb.png",
	"tdb online": "/banks/tdb.png",
	"trade and development bank": "/banks/tdb.png",
	// "Social Pay" / "Голомт банк"
	socialpay: "/banks/socialpay.png",
	"social pay": "/banks/socialpay.png",
	голомт: "/banks/socialpay.png",
	"голомт банк": "/banks/socialpay.png",
	// "Most money" / "МОСТ мони"
	most: "/banks/most.png",
	"most money": "/banks/most.png",
	// "National investment bank" / "Үндэсний хөрөнгө оруулалтын банк"
	"national investment bank": "/banks/nib.jpeg",
	nib: "/banks/nib.jpeg",
	"үндэсний хөрөнгө оруулалтын банк": "/banks/nib.jpeg",
	// "Chinggis khaan bank" / "Чингис Хаан банк"
	chinggis: "/banks/chinggis.png",
	"chinggis khaan bank": "/banks/chinggis.png",
	"чингис хаан банк": "/banks/chinggis.png",
	// "Capitron bank" / "Капитрон банк"
	capitron: "/banks/capitron.png",
	"capitron bank": "/banks/capitron.png",
	"капитрон банк": "/banks/capitron.png",
	// "Bogd bank" / "Богд банк"
	bogd: "/banks/bogd.png",
	"bogd bank": "/banks/bogd.png",
	"богд банк": "/banks/bogd.png",
	// "Trans bank" / "Тээвэр хөгжлийн банк"
	transbank: "/banks/transbank.png",
	"trans bank": "/banks/transbank.png",
	"тээвэр хөгжлийн банк": "/banks/transbank.png",
	// "M bank" / "М банк"
	mbank: "/banks/mbank.png",
	"m bank": "/banks/mbank.png",
	"м банк": "/banks/mbank.png",
	// "Ard App" / "Ард Апп"
	ard: "/banks/ard.png",
	"ard app": "/banks/ard.png",
	"ард апп": "/banks/ard.png",
	// "Toki App" / "Toki App"
	toki: "/banks/toki.png",
	"toki app": "/banks/toki.png",
	// "Arig bank" / "Ариг банк"
	arig: "/banks/arig.png",
	"arig bank": "/banks/arig.png",
	"ариг банк": "/banks/arig.png",
	// "Monpay" / "Мон Пэй"
	monpay: "/banks/monpay.png",
	"мон пэй": "/banks/monpay.png",
	// "Hipay" / "Hipay"
	hipay: "/banks/hipay.png",
	// "Happy Pay" / "Happy Pay MN"
	happypay: "/banks/happypay.png",
	"happy pay": "/banks/happypay.png",
	"happy pay mn": "/banks/happypay.png",
	// "Sono" / "Sono"
	sono: "/banks/sono.png",
	// "PayOn" / "PayOn"
	payon: "/banks/payon.png",
	// "Tino" / "Tino"
	tino: "/banks/tino.png",
};

const normalize = (value?: string) => value?.trim().toLowerCase() ?? "";

export function resolveBankLogo(name?: string, description?: string): string | null {
	return BANK_LOGOS[normalize(name)] ?? BANK_LOGOS[normalize(description)] ?? null;
}
