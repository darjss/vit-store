export type OrderStatusType =
	| "pending"
	| "shipped"
	| "delivered"
	| "cancelled"
	| "refunded";
export type PaymentProviderType = "qpay" | "transfer" | "cash";
export type PaymentStatusType = "pending" | "success" | "failed";
export type OrderDeliveryProviderType =
	| "tu-delivery"
	| "self"
	| "avidaa"
	| "pick-up";

export interface OrderResult {
	id: number;
	orderNumber: string;
	customerPhone: number;
	status: OrderStatusType;
	total: number;
	notes: string | null;
	address: string;
	deliveryProvider: OrderDeliveryProviderType;
	createdAt: Date;
	updatedAt: Date | null;
	orderDetails: Array<{
		quantity: number;
		product: {
			name: string;
			price: number;
			id: number;
			images: Array<{
				url: string;
			}>;
		};
	}>;
	payments: Array<{
		status: PaymentStatusType;
		provider: PaymentProviderType;
		createdAt: Date;
	}>;
}

export interface ShapedOrder {
	id: number;
	orderNumber: string;
	customerPhone: number;
	status: OrderStatusType;
	total: number;
	notes: string | null;
	createdAt: Date;
	address: string;
	updatedAt: Date | null;
	deliveryProvider: OrderDeliveryProviderType;
	products: Array<{
		quantity: number;
		name: string;
		price: number;
		productId: number;
		imageUrl: string | undefined;
	}>;
	paymentStatus: PaymentStatusType;
	paymentProvider: PaymentProviderType;
}
