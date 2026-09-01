import {
	BarChart2,
	Bell,
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
		icon: Home,
		title: "Нүүр",
		url: "/",
	},
	{
		icon: ShoppingCart,
		title: "Захиалгууд",
		url: "/orders",
	},
	{
		icon: Package,
		title: "Бүтээгдэхүүнүүд",
		url: "/products",
	},
	{
		icon: Bell,
		title: "Нөөц хүлээлт",
		url: "/restock-waitlist",
	},
	{
		icon: ScanSearch,
		title: "Харьцуулалт",
		url: "/review-products",
	},
	{
		icon: BarChart2,
		title: "Аналитик",
		url: "/analytics",
	},
	{
		icon: CreditCard,
		title: "Худалдан авалт",
		url: "/purchases",
	},
	{
		icon: Tags,
		title: "Брэндүүд",
		url: "/brands",
	},
	{
		icon: FolderTree,
		title: "Ангиллууд",
		url: "/categories",
	},
	{
		icon: Users,
		title: "Хэрэглэгчид",
		url: "/customers",
	},
];

export const breadcrumbLabels: Record<string, string> = {
	add: "Нэмэх",
	analytics: "Аналитик",
	brands: "Брэндүүд",
	categories: "Ангиллууд",
	customers: "Хэрэглэгчид",
	orders: "Захиалгууд",
	products: "Бүтээгдэхүүнүүд",
	purchases: "Худалдан авалт",
	"restock-waitlist": "Нөөц хүлээлт",
	"review-products": "Харьцуулалт",
};
