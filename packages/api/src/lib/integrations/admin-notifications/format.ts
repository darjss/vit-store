import type { DetailedOrderNotificationInput, TransferClaimedNotificationInput } from "./types";

export const formatMoney = (amount: number) => `${amount.toLocaleString("en-US")}₮`;

const paymentMethodLabel = (provider: DetailedOrderNotificationInput["provider"]) => {
	switch (provider) {
		case "qpay":
			return "QPay";
		case "transfer":
			return "Шилжүүлэг";
		case "cash":
			return "Бэлэн";
	}
};

export const buildOrderDetailsText = (data: DetailedOrderNotificationInput, dashUrl: string) => {
	const productLines = data.products.map(
		(product, index) =>
			`${index + 1}. ${product.name} x${product.quantity} - ${formatMoney(product.price)}`,
	);

	const lines = [
		"🛒 Шинэ захиалга ирлээ",
		"",
		`Төлбөрийн арга: ${paymentMethodLabel(data.provider)}`,
		`Нийт дүн: ${formatMoney(data.total)}`,
		"",
		`📞 Утас: ${data.customerPhone}`,
		"",
		"📍 Хаяг:",
		data.address,
	];

	const notes = data.notes?.trim();
	if (notes) {
		lines.push("", "📝 Тэмдэглэл:", notes);
	}

	lines.push(
		"",
		"📦 Бүтээгдэхүүн:",
		...productLines,
		"",
		`🔗 ${dashUrl}/orders/${data.orderNumber}`,
	);

	return lines.join("\n");
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
