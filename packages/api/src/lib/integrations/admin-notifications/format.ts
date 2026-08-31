import type {
	DetailedOrderNotificationInput,
	TransferClaimedNotificationInput,
} from "./types";

export const formatMoney = (amount: number) =>
	`${amount.toLocaleString("en-US")} MNT`;

export const buildOrderDetailsText = (data: DetailedOrderNotificationInput) => {
	const title =
		data.status === "payment_confirmed"
			? "Төлбөр баталгаажсан захиалга"
			: "Шинэ захиалга (шилжүүлгээр төлнө)";

	const productLines = data.products.map(
		(product, index) =>
			`${index + 1}. ${product.name} x${product.quantity} - ${formatMoney(product.price)}`,
	);

	const notes = data.notes?.trim() ? data.notes : "-";

	return [
		title,
		`Төлбөр: ${data.paymentNumber}`,
		`Утас: ${data.customerPhone}`,
		`Хаяг: ${data.address}`,
		`Тэмдэглэл: ${notes}`,
		`Нийт дүн: ${formatMoney(data.total)}`,
		"Бүтээгдэхүүн:",
		...productLines,
	].join("\n");
};

export const buildTransferClaimedText = (
	data: TransferClaimedNotificationInput,
	dashUrl: string,
) => {
	const productLines = data.products.map(
		(product, index) =>
			`${index + 1}. ${product.name} x${product.quantity} - ${formatMoney(product.price)}`,
	);

	const notes = data.notes?.trim() ? data.notes : "-";

	return [
		"Хэрэглэгч шилжүүлэг хийсэн гэж мэдэгдлээ",
		`Төлбөр: ${data.paymentNumber}`,
		`Дүн: ${formatMoney(data.total)}`,
		`Утас: ${data.customerPhone}`,
		`Хаяг: ${data.address}`,
		`Тэмдэглэл: ${notes}`,
		"Бүтээгдэхүүн:",
		...productLines,
		"",
		`Admin: ${dashUrl}/orders`,
	].join("\n");
};
