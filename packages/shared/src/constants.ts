export const status = ["active", "draft", "out_of_stock"] as const;

export const orderStatus = [
	"created",
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
] as const;

export const paymentProvider = ["qpay", "transfer", "cash"] as const;

/**
 * Bank transfer (Данс) payment option toggle.
 * Set to true to re-enable the transfer tab at checkout and the
 * `payment.selectTransfer` tRPC mutation. Disabled 2026-06-24 to reduce
 * checkout friction while the transfer confirmation flow is being revised.
 */
export const BANK_TRANSFER_ENABLED = true;

export const deliveryProvider = [
	"tu-delivery",
	"self",
	"avidaa",
	"pick-up",
] as const;

export const paymentStatus = [
	"pending",
	"customer_claimed_paid",
	"success",
	"failed",
] as const;

export const purchaseProvider = [
	"amazon",
	"iherb",
	"naturebell",
	"unknown",
] as const;

export const purchaseStatus = [
	"draft",
	"ordered",
	"shipped",
	"forwarder_received",
	"partially_received",
	"received",
	"cancelled",
] as const;

export const PRODUCT_PER_PAGE = 10;

export const productFields = [
	"id",
	"name",
	"slug",
	"description",
	"status",
	"discount",
	"amount",
	"potency",
	"stock",
	"price",
	"dailyIntake",
	"expirationDate",
	"categoryId",
	"brandId",
	"createdAt",
	"updatedAt",
] as const;

export const productColors = [
	"#FFE066",
	"#FFF991",
	"#FFD84D",
	"#FFEE88",
	"#FFB5E8",
	"#B4F8C8",
	"#FFC6A5",
	"#FFABAB",
	"#FFF5BA",
	"#E7FFAC",
	"#CAFFBF",
	"#A0C4FF",
	"#D4A5FF",
	"#FFD6E8",
	"#B9FBC0",
	"#FDFFB6",
	"#FBE4FF",
	"#C4FAF8",
	"#FFE5B4",
	"#E8F3D6",
	"#FFD1DC",
	"#D6E9FF",
	"#FFCCE5",
	"#F5E6CC",
];

export const badgeClasses = {
	featured: "bg-secondary text-secondary-foreground",
	new: "bg-accent text-accent-foreground",
	discount: "bg-destructive text-destructive-foreground",
};

export const badgeIconNames = {
	featured: "star-fill",
	new: "sparkles-line",
	discount: "fire-fill",
};

// Flat delivery fee added to every order (storefront cart, the order API total,
// and the Messenger order summary). 6,000₮ going forward; the zone is recorded
// for routing but does not change the fee.
export const deliveryFee = 6000;

// Single source of truth for the bank-transfer destination shown to customers
// (storefront payment page AND the Messenger payment surface, #25). The transfer
// reference is the customer's own phone number, supplied per order — never part
// of this static account record.
export const bankTransfer = {
	bankName: "Хаан банк",
	accountNumber: "5011147435",
	accountName: "Aviddaram Bazarragchaa",
} as const;

export const productTagSuggestions = [
	"витамин",
	"эрүүл мэнд",
	"дархлаа",
	"эрчим хүч",
	"унтлага",
	"стресс",
	"булчин",
	"үе мөч",
	"арьс үс",
	"хоол боловсруулалт",
	"зүрх судас",
	"тархи",
	"нүд",
	"яс",
	"төмөр",
	"омега",
	"пробиотик",
	"коллаген",
	"протеин",
	"эмэгтэй",
	"эрэгтэй",
	"хүүхэд",
] as const;
