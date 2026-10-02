// Owner-approved customer-facing text (~/dev/scratchpad/vit-store/briefs/pr4-copy.md).
// Verbatim: do not rewrite or translate. The model never produces these.

export const DELIVERY_UB =
	"Төлбөр орсны дараа өнөөдөр эсвэл маргааш 12 цагаас хойш орой болтол хүргэнэ.";
export const DISPATCH_COUNTRYSIDE =
	"Төлбөр орсны дараа өнөөдөр эсвэл маргааш автобус, таксинд тавьж явуулна.";

export const CART_EMPTY = 'Сагс хоосон байна. Бараагаа сонгоод "Захиалах" дээр дарна уу.';
export const CART_CHANGED = "Сагс өөрчлөгдсөн байна. Шинэ мэдээллээ шалгаарай.";
export const NEEDS_DELIVERY = "Утас, хаягаа бичээрэй.";

export const CLAIM_ACK = "Баярлалаа 🙏 Шилжүүлгийг шалгаад баталгаажуулна.";
export const ALREADY_PAID = "Энэ захиалгын төлбөр баталгаажсан байна 🙏";
export const HANDOFF = "Админ удахгүй хариулна 🙏";
export const IMAGE_UNREADABLE = "Зураг харагдахгүй байна, дахин илгээнэ үү.";

export const ERROR = "Уучлаарай, түр алдаа гарлаа. Дахин оролдоно уу.";

export const CONFIRM_PROMPT = "Зөв бол захиалгаа баталгаажуулна уу 👇";
export const PAY_PROMPT = "Төлбөрөө сонгоно уу 👇";
export const TRANSFER_PROMPT = "Шилжүүлсний дараа дарна уу 👇";

export const DELIVERY_FEE = 6000;

const mnt = (amount: number): string => `${Math.round(amount).toLocaleString("en-US")}₮`;

export const formatConfirmSummary = (input: {
	address: string;
	items: Array<{ name: string; price: number; qty: number }>;
	note?: string;
	phone: string;
}): string => {
	const lines = input.items.map(
		(item) => `${item.name} × ${item.qty} — ${mnt(item.price * item.qty)}`,
	);
	const subtotal = input.items.reduce((s, i) => s + i.price * i.qty, 0);
	return [
		"Захиалгаа шалгаарай:",
		...lines,
		`Хүргэлт: ${mnt(DELIVERY_FEE)}`,
		`Нийт: ${mnt(subtotal + DELIVERY_FEE)}`,
		`Утас: ${input.phone}`,
		`Хаяг: ${input.address}`,
		...(input.note ? [`Тэмдэглэл: ${input.note}`] : []),
	].join("\n");
};

export const formatOrderCreated = (input: {
	countryside: boolean;
	orderNumber: string;
	total: number;
}): string =>
	[
		`Захиалга авлаа 🙏 №${input.orderNumber}`,
		`Нийт: ${mnt(input.total)}`,
		input.countryside ? DISPATCH_COUNTRYSIDE : DELIVERY_UB,
	].join("\n");

export const formatBankDetails = (input: {
	accountName: string;
	accountNumber: string;
	phone: string;
	total: number;
}): string =>
	[
		"Дансаар шилжүүлэх мэдээлэл:",
		"Банк: Хаан банк",
		`Данс: ${input.accountNumber}`,
		`Нэр: ${input.accountName}`,
		`Дүн: ${mnt(input.total)}`,
		`Гүйлгээний утга: ${input.phone}`,
		"",
		`Гүйлгээний утга хэсэгт заавал ${input.phone} гэж бичнэ үү.`,
	].join("\n");

export const formatPaid = (countryside: boolean): string =>
	countryside
		? "Төлбөр баталгаажлаа 🙏 Өнөөдөр эсвэл маргааш автобус, таксинд тавьж явуулна."
		: "Төлбөр баталгаажлаа 🙏 Өнөөдөр эсвэл маргааш 12 цагаас хойш орой болтол хүргэнэ.";
