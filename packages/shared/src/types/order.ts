export type OrderStatusType =
	| "created"
	| "pending"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "refunded";
export type PaymentProviderType = "qpay" | "transfer" | "cash";
export type PaymentStatusType = "pending" | "customer_claimed_paid" | "success" | "failed";
export type OrderDeliveryProviderType = "tu-delivery" | "self" | "avidaa" | "pick-up";

export interface OrderResult {
	address: string;
	createdAt: Date;
	customerPhone: number;
	deliveryProvider: OrderDeliveryProviderType;
	id: number;
	notes: string | null;
	orderDetails: Array<{
		product: {
			id: number;
			images: Array<{
				url: string;
			}>;
			name: string;
			price: number;
		};
		quantity: number;
	}>;
	orderNumber: string;
	payments: Array<{
		createdAt: Date;
		paymentNumber: string;
		provider: PaymentProviderType;
		status: PaymentStatusType;
	}>;
	status: OrderStatusType;
	total: number;
	updatedAt: Date | null;
}

export interface OrderListRow {
	address: string;
	createdAt: Date;
	customerPhone: number;
	deliveryProvider: OrderDeliveryProviderType;
	id: number;
	notes: string | null;
	orderNumber: string;
	paymentNumber?: string;
	paymentProvider: PaymentProviderType;
	paymentStatus: PaymentStatusType;
	products: Array<{
		imageUrl: string | undefined;
		name: string;
		price: number;
		productId: number;
		quantity: number;
	}>;
	status: OrderStatusType;
	total: number;
	updatedAt: Date | null;
}
