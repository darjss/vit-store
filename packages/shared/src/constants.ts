export const status = ["active", "draft", "out_of_stock"] as const;

export const orderStatus = [
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
] as const;

export const paymentProvider = ["qpay", "transfer", "cash"] as const;

export const deliveryProvider = [
	"tu-delivery",
	"self",
	"avidaa",
	"pick-up",
] as const;

export const paymentStatus = ["pending", "success", "failed"] as const;

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

export const deliveryFee = 6000;
