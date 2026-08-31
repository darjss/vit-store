export type DetailedOrderNotificationInput = {
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
	status: "pending_transfer" | "payment_confirmed";
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
