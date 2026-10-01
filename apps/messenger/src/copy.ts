// Owner-approved customer-facing text (~/dev/scratchpad/vit-store/briefs/pr4-copy.md).
// Verbatim: do not rewrite or translate. The model never produces these.

export const DELIVERY_TODAY = "Төлбөр орсны дараа өнөөдөр хүргэнэ.";
export const DELIVERY_TOMORROW = "Төлбөр орсны дараа маргааш хүргэнэ.";

export const CART_EMPTY = 'Сагс хоосон байна. Бараагаа сонгоод "Захиалах" дээр дарна уу.';
export const CART_CHANGED = "Сагс өөрчлөгдсөн байна. Шинэ мэдээллээ шалгаарай.";
export const NEEDS_DELIVERY = "Утас, хаягаа бичээрэй.";

export const CLAIM_ACK = "Баярлалаа 🙏 Шилжүүлгийг шалгаад баталгаажуулна.";
export const ALREADY_PAID = "Энэ захиалгын төлбөр баталгаажсан байна 🙏";
export const HANDOFF = "Админ удахгүй хариулна 🙏";
export const ERROR = "Уучлаарай, түр алдаа гарлаа. Дахин оролдоно уу.";

export const DELIVERY_FEE = 6000;

// Order created before 11:00 Ulaanbaatar time -> same-day line, else tomorrow.
export const deliveryLine = (createdAtMs: number): string => {
	const hour = Number(
		new Intl.DateTimeFormat("en-US", {
			hour: "2-digit",
			hour12: false,
			timeZone: "Asia/Ulaanbaatar",
		}).format(new Date(createdAtMs)),
	);
	return hour < 11 ? DELIVERY_TODAY : DELIVERY_TOMORROW;
};

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
	createdAtMs: number;
	orderNumber: string;
	total: number;
}): string =>
	[
		`Захиалга авлаа 🙏 №${input.orderNumber}`,
		`Нийт: ${mnt(input.total)}`,
		deliveryLine(input.createdAtMs),
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
		`Гүйлгээний утга хэсэгт заавал ${input.phone} гэж бичнэ үү. Шилжүүлсний дараа "Шилжүүлсэн" товчийг дарна уу.`,
	].join("\n");

export const formatPaid = (createdAtMs: number): string =>
	`Төлбөр баталгаажлаа 🙏 ${deliveryLine(createdAtMs) === DELIVERY_TODAY ? "өнөөдөр" : "маргааш"} хүргэнэ.`;
