export type DetailedOrderNotificationInput = {
	orderNumber: string;
	paymentNumber: string;
	provider: "qpay" | "transfer" | "cash";
	customerPhone: number;
	address: string;
	notes: string | null;
	total: number;
	products: Array<{
		name: string;
		quantity: number;
		price: number;
		imageUrl?: string;
	}>;
};

export type TransferClaimedNotificationInput = {
	paymentNumber: string;
	customerPhone: number;
	address: string;
	notes: string | null;
	total: number;
	products: Array<{
		name: string;
		quantity: number;
		price: number;
		imageUrl?: string;
	}>;
};
