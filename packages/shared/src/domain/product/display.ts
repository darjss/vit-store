export function formatExpirationMonthYear(value?: string | null) {
	if (!value) return "Тодорхойлоогүй";
	const [year, month] = value.split("-");
	if (!year || !month) return value;
	return `${month}/${year}`;
}

export function formatProductStatusMn(
	status: "active" | "draft" | "out_of_stock" | string,
	isOutOfStock: boolean,
) {
	if (isOutOfStock) return "Дууссан";
	switch (status) {
		case "active":
			return "Идэвхтэй";
		case "draft":
			return "Ноорог";
		case "out_of_stock":
			return "Дууссан";
		default:
			return String(status).replaceAll("_", " ");
	}
}
