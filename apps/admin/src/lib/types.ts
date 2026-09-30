import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AdminRouter, UserSelectType } from "@vit/api";

export type RouterOutputs = inferRouterOutputs<AdminRouter>;
export type RouterInputs = inferRouterInputs<AdminRouter>;

export type BrandType = RouterOutputs["brands"]["getAllBrands"][number];
export type OrderType = RouterOutputs["order"]["getOrderById"];
export type CategoryType = RouterOutputs["category"]["getAllCategories"][number];
export type BrandsType = RouterOutputs["brands"]["getAllBrands"];
export type CategoriesType = RouterOutputs["category"]["getAllCategories"];
export type ProductType = RouterOutputs["product"]["getAllProducts"][number];
export type PurchaseDetailType = NonNullable<RouterOutputs["purchase"]["getPurchaseById"]>;
export type ProductSearchForOrderType = RouterOutputs["product"]["searchProductsInstant"][number];
export interface Session {
	expiresAt: Date;
	id: string;
	user: UserSelectType;
}
