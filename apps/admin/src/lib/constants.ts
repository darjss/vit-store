import {
	BarChart2,
	CreditCard,
	FolderTree,
	Home,
	Package,
	ScanSearch,
	ShoppingCart,
	Tags,
	Users,
} from "lucide-react";

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
		title: "Харьцуулалт",
		url: "/review-products",
		icon: ScanSearch,
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
