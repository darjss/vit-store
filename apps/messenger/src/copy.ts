// Owner-approved customer-facing text. The model never produces these.
import { deliveryFee } from "@vit/shared/constants";

export const DELIVERY_UB = "Өнөөдөр эсвэл маргааш 12 цагаас хойш орой болтол хүргэнэ.";
export const DISPATCH_COUNTRYSIDE =
	"Төлбөр орсны дараа өнөөдөр эсвэл маргааш автобус, таксинд тавьж явуулна.";

export const CART_EMPTY = 'Сагс хоосон байна. Бараагаа сонгоод "Сонгох" дээр дарна уу.';
export const CART_CHANGED = "Сагс өөрчлөгдсөн байна. Шинэ мэдээллээ шалгаарай.";
export const NEEDS_DELIVERY = "За, хаяг утсаа үлдээгээрэй 🙏";
export const EDIT_PROMPT = "Юу өөрчлөх вэ? Бичээд эсвэл доороос сонгоорой:";

// Welcome-screen buttons.
export const ASK_PRODUCT = "Ямар бараа сонирхож байна вэ? Нэрийг нь бичээрэй.";
export const DELIVERY_INFO = `Улаанбаатарт хүргэлт ${Math.round(deliveryFee).toLocaleString("en-US")}₮, өнөөдөр эсвэл маргааш 12 цагаас хойш орой болтол хүргэнэ (бараагаа хүлээж аваад шилжүүлж болно). Орон нутаг руу төлбөр орсны дараа автобус, таксинд тавьж явуулна.`;

export const CLAIM_ACK = "Баярлалаа 🙏 Шилжүүлгийг шалгаад баталгаажуулна.";
export const ALREADY_PAID = "Энэ захиалгын төлбөр баталгаажсан байна 🙏";
export const HANDOFF = "Админ удахгүй хариулна 🙏";
export const IMAGE_UNREADABLE = "Зураг харагдахгүй байна, дахин илгээнэ үү.";
export const ERROR = "Уучлаарай, түр алдаа гарлаа. Дахин оролдоно уу.";

export const CONFIRM_PROMPT = 'Зөв бол "За" гэж бичих эсвэл товчоо дараарай 👇';
export const TRANSFER_PROMPT = "Шилжүүлсний дараа дарна уу 👇";

export const STOCK_LABEL = {
	in_stock: "Бэлэн байгаа",
	low_stock: "Цөөн үлдсэн",
	out_of_stock: "Дууссан",
} as const;

export const mnt = (amount: number): string => `${Math.round(amount).toLocaleString("en-US")}₮`;

const CARD_TITLE_MAX = 68;
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

export const formatItemSelected = (name: string, price: number): string =>
	`${cardTitle(name)} (${mnt(price)}) сонголоо. Өөр бараа нэмэх бол бичээрэй, үгүй бол хаяг утсаа үлдээгээрэй.`;

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
		`Захиалга авлаа 🙏 №${input.orderNumber}`,
		input.countryside ? DISPATCH_COUNTRYSIDE : DELIVERY_UB,
		`Дүн: ${mnt(input.total)}`,
		"",
		input.countryside
			? "Дансаар шилжүүлэх мэдээлэл:"
			: "Бараагаа хүлээж аваад шилжүүлнэ үү (урьдчилан шилжүүлж болно):",
		`Хаан банк ${input.accountNumber}`,
		input.accountName,
		`Гүйлгээний утга: ${input.phone}`,
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
			? `Бараа тань очлоо 🙏 ${mnt(input.total)}-өө шилжүүлээрэй:`
			: `${mnt(input.total)}-өө шилжүүлээрэй 🙏`,
		`Хаан банк ${input.accountNumber}`,
		input.accountName,
		`Гүйлгээний утга: ${input.phone}`,
	].join("\n");

export const formatReminder = (input: {
	accountNumber: string;
	orderNumber: string;
	phone: string;
	total: number;
}): string =>
	`Сайн байна уу 🙏 №${input.orderNumber}-ийн ${mnt(input.total)}-өө шилжүүлээд өгөөрэй. Хаан банк ${input.accountNumber}, утга ${input.phone}`;

export const formatPaid = (countryside: boolean): string =>
	countryside
		? "Төлбөр баталгаажлаа 🙏 Өнөөдөр эсвэл маргааш автобус, таксинд тавьж явуулна."
		: "Төлбөр баталгаажлаа 🙏 Баярлалаа!";
