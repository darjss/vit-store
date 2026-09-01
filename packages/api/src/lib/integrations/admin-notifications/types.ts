export type DetailedOrderNotificationInput = {
	address: string;
	customerPhone: number;
	notes: string | null;
	orderNumber: string;
	paymentNumber: string;
	products: Array<{
		imageUrl?: string;
		name: string;
		price: number;
		quantity: number;
	}>;
	provider: "qpay" | "transfer" | "cash";
	total: number;
};

export type TransferClaimedNotificationInput = {
	address: string;
	customerPhone: number;
	notes: string | null;
	paymentNumber: string;
	products: Array<{
		imageUrl?: string;
		name: string;
		price: number;
		quantity: number;
	}>;
	total: number;
};
