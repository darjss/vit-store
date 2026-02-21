export const getStatusColor = (status: string) => {
	switch (status) {
		case "ACTIVE":
			return "bg-[#00ff88] text-black border-black";
		case "OUT_OF_STOCK":
			return "bg-[#ff4757] text-white border-black";
		case "DISCONTINUED":
			return "bg-[#2c2c54] text-white border-black";
		default:
			return "bg-[#ff6b35] text-black border-black";
	}
};

export const getStockColor = (stock: number) => {
	if (stock > 10) return "text-[#00ff88]";
	if (stock > 0) return "text-[#ffa502]";
	return "text-[#ff4757]";
};
export const getPaymentStatusColor = (status: string) => {
	switch (status) {
		case "success":
			return "border-black bg-[#00ff88] text-black";
		case "pending":
			return "border-black bg-[#ffa502] text-black";
		case "failed":
			return "border-black bg-[#ff4757] text-white";
		default:
			return "border-black bg-[#5f27cd] text-white";
	}
};

export const getPaymentProviderIcon = (provider: string) => {
	switch (provider.toLowerCase()) {
		case "qpay":
			return "📱";
		case "cash":
			return "💵";
		case "transfer":
			return "🏦";
		default:
			return "💳";
	}
};
export function formatCurrency(amount: number): string {
	return `${amount}₮`;
}

// Order status styles for badges and left-border colors
export const getOrderStatusStyles = (status: string) => {
	switch (status.toLowerCase()) {
		case "delivered":
			return {
				badge: "border-black bg-[#00ff88] text-black",
				border: "border-l-[#00ff88]",
			};
		case "shipped":
			return {
				badge: "border-black bg-[#3742fa] text-white",
				border: "border-l-[#3742fa]",
			};
		case "pending":
			return {
				badge: "border-black bg-[#ffa502] text-black",
				border: "border-l-[#ffa502]",
			};
		case "cancelled":
		case "canceled":
			return {
				badge: "border-black bg-[#ff4757] text-white",
				border: "border-l-[#ff4757]",
			};
		default:
			return {
				badge: "border-black bg-[#5f27cd] text-white",
				border: "border-l-[#5f27cd]",
			};
	}
};

export function findBrandId(
	brandName: string | null | undefined,
	brands: { id: number; name: string }[],
): number {
	if (!brandName) return 0;
	const brand = brands.find(
		(b) => b.name.toLowerCase() === brandName.toLowerCase(),
	);
	return brand?.id || 0;
}

function pad(n: number) {
	return n.toString().padStart(2, "0");
}

export function formatDateToText(d: Date, now = new Date()): string {
	const startOfDay = (dt: Date) =>
		new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
	const msPerDay = 24 * 60 * 60 * 1000;

	const dayDiff = Math.floor(
		(startOfDay(now).getTime() - startOfDay(d).getTime()) / msPerDay,
	);

	const hh = pad(d.getHours());
	const mm = pad(d.getMinutes());
	const ss = pad(d.getSeconds());
	const time = `${hh}:${mm}:${ss}`;

	if (dayDiff === 0) {
		return `өнөөдөр ${time}`;
	}
	if (dayDiff === 1) {
		return `өчигдөр ${time}`;
	}

	// const daysText = `${dayDiff} хоногийн өмнө`;

	// if (dayDiff <= 2) {
	// 	return `${daysText} ${time}`;
	// }

	const yyyy = d.getFullYear();
	const mmth = pad(d.getMonth() + 1);
	const dd = pad(d.getDate());
	const datePart = `${yyyy}-${mmth}-${dd}`;

	return `${datePart} ${time}`;
}
