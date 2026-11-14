import {
	BarChart2,
	Bell,
	ClipboardCheck,
	CreditCard,
	FolderTree,
	Home,
	Package,
	ScanSearch,
	ShoppingCart,
	Tags,
	Users,
} from "lucide-react";

// `count` names the badge from useNavCounts.
export const navGroups = [
	{
		items: [
			{ icon: Home, title: "Нүүр", url: "/" },
			{ count: "pending", icon: ClipboardCheck, title: "Савлах", url: "/pack" },
			{ count: "claimed", icon: ShoppingCart, title: "Захиалга", url: "/orders" },
			{ icon: Package, title: "Бараа", url: "/products" },
		],
	},
	{
		items: [
			{ icon: CreditCard, title: "Худалдан авалт", url: "/purchases" },
			{ icon: Bell, title: "Нөөц хүлээлт", url: "/restock-waitlist" },
			{ icon: ScanSearch, title: "Үнэ харьцуулалт", url: "/review-products" },
		],
		title: "Нөөц",
	},
	{
		items: [
			{ icon: Tags, title: "Брэнд", url: "/brands" },
			{ icon: FolderTree, title: "Ангилал", url: "/categories" },
			{ icon: Users, title: "Хэрэглэгч", url: "/customers" },
			{ icon: BarChart2, title: "Аналитик", url: "/analytics" },
		],
		title: "Бусад",
	},
] as const;

export const breadcrumbLabels = {
	add: "Нэмэх",
	analytics: "Аналитик",
	brands: "Брэндүүд",
	categories: "Ангиллууд",
	customers: "Хэрэглэгчид",
	orders: "Захиалга",
	pack: "Савлах",
	products: "Бараа",
	purchases: "Худалдан авалт",
	"restock-waitlist": "Нөөц хүлээлт",
	"review-products": "Харьцуулалт",
} satisfies Record<string, string>;

export function labelForBreadcrumb(name: string): string | undefined {
	if (!Object.hasOwn(breadcrumbLabels, name)) {
		return undefined;
	}
	// SAFETY: `Object.hasOwn` confirms `name` is one of the known breadcrumb segment keys.
	return breadcrumbLabels[name as keyof typeof breadcrumbLabels];
}
