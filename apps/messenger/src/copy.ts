// Owner-approved customer-facing text. The model never produces these.
import { deliveryFee } from "@vit/shared/constants";

// Messenger-only bank transfer destination (Batdelger's Khaan account, verified
// manually via Telegram alerts — no Khaan API reconciliation). The website
// storefront stays on `@vit/shared/constants` `bankTransfer`.
export const MESSENGER_BANK_TRANSFER = {
	accountName: "Batdelger Jigjidsuren",
	accountNumber: "MN070005005011147435",
	bankName: "Хаан банк",
} as const;

export const DELIVERY_UB = "Өнөөдөр эсвэл маргааш 12-с хойш хүргэнэ";
export const DISPATCH_COUNTRYSIDE = "Төлбөр орсны дараа унаанд тавьж явуулна";

export const CART_EMPTY = "Ямар бараа авах вэ?";
export const CART_CHANGED = "Сагс өөрчлөгдсөн байна, дахин бичээрэй.";
export const NEEDS_DELIVERY = "За хаяг утсаа үлдээгээрэй";
export const NEEDS_PHONE = "Утасны дугаараа үлдээгээрэй";
export const NEEDS_ADDRESS = "Хаягаа үлдээгээрэй";
export const NEEDS_APT = "Байр, тоотоо нэмээд бичээрэй";
export const EDIT_PROMPT = "Юу өөрчлөх вэ?";

// Welcome-screen buttons.
export const ASK_PRODUCT = "Ямар витамин сонирхож байна вэ?";
export const DELIVERY_INFO = `УБ хүргэлт ${Math.round(deliveryFee).toLocaleString("en-US")}₮, өнөөдөр эсвэл маргааш 12-с хойш хүргэнэ (бараагаа аваад шилжүүлнэ). Орон нутаг руу төлбөр орсны дараа унаанд тавина.`;

export const CLAIM_ACK = "За шалгаад хэлье";
export const ALREADY_PAID = "Төлбөр орсон байна";
export const HANDOFF = "Шалгаад хэлье";
export const STOREPAY_LINK =
	"StorePay-ээр авах бол +11% нэмэгдээд https://zary.mn/stores/54723 линкээр авч болно.";
export const IMAGE_UNREADABLE = "Зураг харагдахгүй байна, дахин явуулна уу.";
export const ERROR = "Шалгаад хэлье";

export const CONFIRM_PROMPT = 'Зөв бол "За" гэж бичээрэй';
export const TRANSFER_PROMPT = "Шилжүүлээд баримтаа явуулаарай";

export const STOCK_LABEL = {
	in_stock: "Бэлэн байгаа",
	low_stock: "Цөөн үлдсэн",
	out_of_stock: "Дууссан",
} as const;

export const mnt = (amount: number): string => `${Math.round(amount).toLocaleString("en-US")}₮`;

const CARD_TITLE_MAX = 44;
const IHERB_NOISE_RE =
	/\b(dietary supplement|flavored with other natural flavors|natural flavors?|per serving)\b/gi;

// Trims verbose iHerb product titles for Messenger's 2-line mobile card header
// and compact order summaries: collapses duplicated brand prefixes, drops
// boilerplate filler, and truncates on a word boundary.
export const cardTitle = (name: string, brand = ""): string => {
	let clean = name.trim().replaceAll(/\s+/g, " ");
	const trimmedBrand = brand.trim();
	if (trimmedBrand.length > 0) {
		const escaped = trimmedBrand.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
		clean = clean.replace(new RegExp(`^(${escaped})[,\\s]+\\1\\b[,\\s]*`, "i"), "$1, ");
	}
	clean = clean
		.replaceAll(IHERB_NOISE_RE, "")
		.replaceAll(/\s*,\s*,+/g, ", ")
		.replace(/[,\s-]+$/, "")
		.replaceAll(/\s+/g, " ")
		.trim();
	if (clean.length <= CARD_TITLE_MAX) {
		return clean;
	}
	const cut = clean.slice(0, CARD_TITLE_MAX - 1);
	const space = cut.lastIndexOf(" ");
	return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[,\s-]+$/, "")}…`;
};

export type MissingDeliveryField = "address" | "both" | "phone";

export const formatItemSelected = (
	_price: number,
	missing: MissingDeliveryField = "both",
): string =>
	missing === "phone" ? NEEDS_PHONE : missing === "address" ? NEEDS_ADDRESS : NEEDS_DELIVERY;

const formatShortK = (amount: number): string =>
	amount % 1000 === 0 ? `${amount / 1000}` : mnt(amount);

const formatPriceEquation = (
	total: number,
	items?: Array<{ price: number; qty: number }>,
): string => {
	if (!items || items.length === 0) {
		return mnt(total);
	}
	const parts = items.flatMap((i) => Array.from({ length: i.qty }, () => Math.round(i.price)));
	const expected = parts.reduce((sum, p) => sum + p, 0) + deliveryFee;
	const allThousands =
		expected === total &&
		total % 1000 === 0 &&
		deliveryFee % 1000 === 0 &&
		parts.every((p) => p % 1000 === 0);
	if (allThousands && parts.length <= 5) {
		const lhs = [...parts.map(formatShortK), formatShortK(deliveryFee)].join("+");
		return `${lhs}=${total / 1000}к`;
	}
	return mnt(total);
};

export const formatConfirmSummary = (input: {
	address: string;
	items: Array<{ name: string; price: number; qty: number }>;
	note?: string;
	phone: string;
}): string => {
	const lines = input.items.map(
		(item) => `${cardTitle(item.name)} × ${item.qty} — ${mnt(item.price * item.qty)}`,
	);
	const subtotal = input.items.reduce((s, i) => s + i.price * i.qty, 0);
	return [
		...lines,
		`Хүргэлт: ${mnt(deliveryFee)} · Нийт: ${mnt(subtotal + deliveryFee)}`,
		`Утас: ${input.phone} · Хаяг: ${input.address}`,
		...(input.note ? [`Тэмдэглэл: ${input.note}`] : []),
	].join("\n");
};

const formatItemsInline = (items?: Array<{ name: string; qty: number }>): string =>
	items && items.length > 0
		? `${items.map((i) => (i.qty > 1 ? `${cardTitle(i.name)} ×${i.qty}` : cardTitle(i.name))).join(", ")} · `
		: "";

export const formatOrderCreated = (input: {
	accountName: string;
	accountNumber: string;
	countryside: boolean;
	items?: Array<{ name: string; price: number; qty: number }>;
	orderNumber: string;
	phone: string;
	total: number;
}): string => {
	const priceText = formatPriceEquation(input.total, input.items);
	if (!input.countryside) {
		return `За авлаа. ${formatItemsInline(input.items)}${priceText}, ${DELIVERY_UB.toLowerCase()} (бараагаа аваад шилжүүлнэ). Өөрчлөх бол бичээрэй`;
	}
	return [
		`За авлаа. ${formatItemsInline(input.items)}${priceText}, ${DISPATCH_COUNTRYSIDE.toLowerCase()}.`,
		`Хаан банк ${input.accountNumber} (${input.accountName})`,
		`Утга: ${input.phone} · шилжүүлээд баримтаа явуулаарай`,
	].join("\n");
};

export const formatBankDue = (input: {
	accountName: string;
	accountNumber: string;
	delivered: boolean;
	items?: Array<{ name: string; price: number; qty: number }>;
	phone?: string;
	total: number;
}): string => {
	const itemPrefix = formatItemsInline(input.items);
	const priceText = formatPriceEquation(input.total, input.items);
	const header = input.delivered
		? `Бараа очлоо. ${itemPrefix}${priceText}`
		: `${itemPrefix}${priceText} шилжүүлээрэй`;
	return [
		header,
		`Хаан банк ${input.accountNumber} (${input.accountName})`,
		`Утга: ${input.phone ?? "утасны дугаар"} · баримтаа явуулаарай`,
	].join("\n");
};

export const formatReminder = (input: {
	accountNumber: string;
	orderNumber: string;
	phone: string;
	total: number;
}): string =>
	`${mnt(input.total)} шилжүүлээрэй. Хаан банк ${input.accountNumber}, утга ${input.phone}`;

export const formatExternalBankDetails = (phone?: string): string =>
	[
		`Хаан банк ${MESSENGER_BANK_TRANSFER.accountNumber} (${MESSENGER_BANK_TRANSFER.accountName})`,
		`Утга: ${phone ?? "утасны дугаар"} (барааны үнэ + хүргэлт ${mnt(deliveryFee)}) · шилжүүлээд баримтаа явуулаарай`,
	].join("\n");

export const formatPaid = (countryside: boolean): string =>
	countryside
		? "Төлбөр орсон байна, өнөөдөр эсвэл маргааш унаанд тавьж явуулна."
		: "Төлбөр орсон байна, баярлалаа.";
