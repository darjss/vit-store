// Owner-approved customer-facing text. The model never produces these.
import { bankTransfer, deliveryFee } from "@vit/shared/constants";

export const DELIVERY_UB = "Өнөөдөр эсвэл маргааш 12-с хойш хүргэнэ.";
export const DISPATCH_COUNTRYSIDE = "Төлбөр орсны дараа унаанд тавьж явуулна.";

export const CART_EMPTY = 'Сагс хоосон байна. Бараагаа сонгоод "Сонгох" дараарай.';
export const CART_CHANGED = "Сагс өөрчлөгдсөн байна, дахин шалгаарай.";
export const NEEDS_DELIVERY = "За, хаяг утсаа үлдээгээрэй 🙏";
export const NEEDS_PHONE = "За, утасны дугаараа үлдээгээрэй 🙏";
export const NEEDS_ADDRESS = "За, хаягаа үлдээгээрэй 🙏";
export const EDIT_PROMPT = "Юу өөрчлөх вэ?";

// Welcome-screen buttons.
export const ASK_PRODUCT = "Ямар витамин сонирхож байна вэ?";
export const DELIVERY_INFO = `УБ хүргэлт ${Math.round(deliveryFee).toLocaleString("en-US")}₮, өнөөдөр эсвэл маргааш 12-с хойш хүргэнэ (бараагаа аваад шилжүүлж болно). Орон нутаг руу төлбөр орсны дараа унаанд тавина.`;

export const CLAIM_ACK = "Баярлалаа 🙏 Шалгаад баталгаажуулъя.";
export const ALREADY_PAID = "Энэ захиалгын төлбөр баталгаажсан байна 🙏";
export const HANDOFF = "Админ удахгүй хариулна 🙏";
export const STOREPAY_LINK =
	"StorePay-ээр авах бол +11% нэмэгдээд https://zary.mn/stores/54723 линкээр захиалж болно.";
export const IMAGE_UNREADABLE = "Зураг харагдахгүй байна, дахин явуулна уу.";
export const ERROR = "Уучлаарай, түр алдаа гарлаа. Дахин бичээрэй.";

export const CONFIRM_PROMPT = 'Зөв бол "За" эсвэл товчоо дараарай 👇';
export const TRANSFER_PROMPT = "Шилжүүлсний дараа дарна уу 👇";

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
	price: number,
	missing: MissingDeliveryField = "both",
): string => {
	const ask =
		missing === "phone"
			? "утсаа үлдээгээрэй."
			: missing === "address"
				? "хаягаа үлдээгээрэй."
				: "хаяг утсаа үлдээгээрэй.";
	return `Сонголоо (${mnt(price)}) ✓ Өөр бараа нэмэх үү, эсвэл ${ask}`;
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
		"Захиалгаа шалгаарай:",
		...lines,
		`Хүргэлт: ${mnt(deliveryFee)}`,
		`Нийт: ${mnt(subtotal + deliveryFee)}`,
		`Утас: ${input.phone}`,
		`Хаяг: ${input.address}`,
		...(input.note ? [`Тэмдэглэл: ${input.note}`] : []),
	].join("\n");
};

export const formatOrderCreated = (input: {
	accountName: string;
	accountNumber: string;
	countryside: boolean;
	orderNumber: string;
	phone: string;
	total: number;
}): string =>
	[
		`Захиалга авлаа 🙏 №${input.orderNumber} · ${mnt(input.total)}`,
		input.countryside ? DISPATCH_COUNTRYSIDE : `${DELIVERY_UB} Бараагаа аваад шилжүүлээрэй.`,
		`Хаан банк ${input.accountNumber} (${input.accountName})`,
		`Утга: ${input.phone}`,
	].join("\n");

export const formatBankDue = (input: {
	accountName: string;
	accountNumber: string;
	delivered: boolean;
	phone: string;
	total: number;
}): string =>
	[
		input.delivered
			? `Бараа тань очлоо 🙏 ${mnt(input.total)}`
			: `${mnt(input.total)} шилжүүлээрэй 🙏`,
		`Хаан банк ${input.accountNumber} (${input.accountName})`,
		`Утга: ${input.phone}`,
	].join("\n");

export const formatReminder = (input: {
	accountNumber: string;
	orderNumber: string;
	phone: string;
	total: number;
}): string =>
	`№${input.orderNumber}-ийн ${mnt(input.total)} шилжүүлээрэй 🙏 Хаан банк ${input.accountNumber}, утга ${input.phone}`;

export const formatExternalBankDetails = (phone?: string): string =>
	[
		`Хаан банк ${bankTransfer.accountNumber} (${bankTransfer.accountName})`,
		phone
			? `Утга: ${phone} · Баримтаа явуулаарай 🙏`
			: "Утга: утасны дугаар · Баримтаа явуулаарай 🙏",
	].join("\n");

export const formatPaid = (countryside: boolean): string =>
	countryside
		? "Төлбөр баталгаажлаа 🙏 Өнөөдөр эсвэл маргааш автобус, таксинд тавьж явуулна."
		: "Төлбөр баталгаажлаа 🙏 Баярлалаа!";
