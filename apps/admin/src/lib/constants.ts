import {
    Home,
    ShoppingCart,
    Package,
    BarChart2,
    Tags,
    FolderTree,
    Users, CreditCard
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

export const PRODUCT_PER_PAGE = 5;

export const sideNavItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Orders",
    url: "/orders",
    icon: ShoppingCart,
  },
  {
    title: "Products",
    url: "/products",
    icon: Package,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: BarChart2,
  },
  {
    title: "Purchases",
    url: "/purchases",
    icon: CreditCard,
  },
  {
    title: "Brands",
    url: "/brands",
    icon: Tags,
  },
  {
    title: "Categories",
    url: "/categories",
    icon: FolderTree,
  },
  {
    title: "Users",
    url: "/users",
    icon: Users,
  },
];
