export const status = ["active", "draft", "out_of_stock"] as const;

export const orderStatus = [
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
] as const;

export const paymentProvider = ["qpay", "transfer", "cash"] as const;

export const deliveryProvider = ["tu-delivery", "self", "avidaa"] as const;

export const paymentStatus = ["pending", "success", "failed"] as const;

export const PRODUCT_PER_PAGE = 5;
