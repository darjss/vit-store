import {
	BarChart2,
	CreditCard,
	FolderTree,
	Home,
	Package,
	ShoppingCart,
	Tags,
	Users,
} from "lucide-react";

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

export const PRODUCT_PER_PAGE = 10;

export const sideNavItems = [
	{
		title: "Нүүр",
		url: "/",
		icon: Home,
	},
	{
		title: "Захиалгууд",
		url: "/orders",
		icon: ShoppingCart,
	},
	{
		title: "Бүтээгдэхүүнүүд",
		url: "/products",
		icon: Package,
	},
	{
		title: "Аналитик",
		url: "/analytics",
		icon: BarChart2,
	},
	{
		title: "Худалдан авалт",
		url: "/purchases",
		icon: CreditCard,
	},
	{
		title: "Брэндүүд",
		url: "/brands",
		icon: Tags,
	},
	{
		title: "Ангиллууд",
		url: "/categories",
		icon: FolderTree,
	},
	{
		title: "Хэрэглэгчид",
		url: "/customers",
		icon: Users,
	},
];
