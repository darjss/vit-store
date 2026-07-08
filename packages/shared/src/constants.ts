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

/**
 * Subset of {@link productFields} that may be safely written via the
 * `updateProductField` inline-edit endpoint. Excludes identity (`id`, `slug`)
 * and timestamp (`createdAt`, `updatedAt`) columns so an admin/bot cannot
 * corrupt FK references, break URL routing, or rewrite history.
 */
export const editableProductFields = [
	"name",
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
] as const;

/**
 * Cutoff for the "products needing review" dashboard list
 * (`getReviewProducts`). Products whose `updatedAt` is null or older than this
 * timestamp are surfaced for review. Centralized here so it is not a hidden
 * magic constant in the query; bump it when the review window moves.
 */
export const PRODUCT_REVIEW_CUTOFF_DATE = "2026-04-30T16:00:00Z";

export const productColors = [
	"#FFE5D3",
	"#FFE1E7",
	"#D3F9E3",
	"#CDF6FF",
	"#F3E8FF",
	"#F6F0CA",
	"#E4F6D3",
	"#FFE9CB",
	"#FFD6C1",
	"#FFD2D8",
	"#C0EED4",
	"#B9EAFF",
	"#E7D9FF",
	"#EAE3B5",
	"#D4EAC0",
	"#FCDBB7",
	"#F4CAB7",
	"#F6C6CC",
	"#B6E0C8",
	"#B0DCF2",
	"#D9CDF4",
	"#DCD6AC",
	"#C8DCB6",
	"#ECCFAE",
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
