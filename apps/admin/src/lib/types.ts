import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AdminRouter, UserSelectType } from "@vit/api";

export type RouterOutputs = inferRouterOutputs<AdminRouter>;
export type RouterInputs = inferRouterInputs<AdminRouter>;

export type BrandType = RouterOutputs["brands"]["getAllBrands"][number];
export type OrderType = RouterOutputs["order"]["getOrderById"];
export type CategoryType =
	RouterOutputs["category"]["getAllCategories"][number];
export type BrandsType = RouterOutputs["brands"]["getAllBrands"];
export type CategoriesType = RouterOutputs["category"]["getAllCategories"];
export type ProductType = RouterOutputs["product"]["getAllProducts"][number];
export type PurchaseType = RouterOutputs["purchase"]["getAllPurchases"][number];
export type UserType = RouterOutputs["auth"]["me"];
export type ProductSearchForOrderType =
	RouterOutputs["product"]["searchProductByNameForOrder"][number];
export interface Session {
	id: string;
	user: UserSelectType;
	expiresAt: Date;
}
