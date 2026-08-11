import { BoxIcon } from "@solar-icons/solid/linear/box";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DocumentTextIcon } from "@solar-icons/solid/linear/document-text";
import type { Component } from "solid-js";

import type { api } from "@/lib/trpc";

export type ProductStatus = "active" | "draft" | "out_of_stock";

export type ProductListResult = Awaited<
	ReturnType<typeof api.product.getPaginatedProducts.query>
>;
export type ProductListItem = ProductListResult["products"][number];
export type ProductDetail = NonNullable<
	Awaited<ReturnType<typeof api.product.getProductById.query>>
>;
export type InstantSearchItem = Awaited<
	ReturnType<typeof api.product.searchProductsInstant.query>
>[number];
export type BrandOption = Awaited<
	ReturnType<typeof api.brands.getAllBrands.query>
>[number];
export type CategoryOption = Awaited<
	ReturnType<typeof api.category.getAllCategories.query>
>[number];

export interface ProductImage {
	id?: number;
	url: string;
	isPrimary?: boolean;
}

/**
 * The card surface: a product from the paginated list, instant search, or
 * detail. The list and detail shapes satisfy this directly; instant-search
 * results are mapped onto it.
 */
export interface ProductCardData {
	id: number;
	name: string;
	slug: string;
	price: number;
	stock: number;
	status: ProductStatus;
	images: ProductImage[];
	brandId?: number;
	categoryId?: number;
	amount?: string;
	potency?: string;
	discount?: number;
	expirationDate?: string | null;
}

export interface ProductStatusMeta {
	label: string;
	tone: "gray" | "lemon" | "coral";
	icon: Component;
}

/** Badge copy follows the approved prototype (variant B, triage agenda). */
export const PRODUCT_STATUS_META: Record<ProductStatus, ProductStatusMeta> = {
	active: { label: "Зарагдаж буй", tone: "gray", icon: BoxIcon },
	draft: { label: "Ноорог", tone: "lemon", icon: DocumentTextIcon },
	out_of_stock: {
		label: "Дууссан",
		tone: "coral",
		icon: CloseCircleIcon,
	},
};

/** Options for the form/detail status select (legacy admin copy). */
export const PRODUCT_STATUS_OPTIONS: Array<{
	value: ProductStatus;
	label: string;
}> = [
	{ value: "active", label: "Идэвхтэй" },
	{ value: "draft", label: "Ноорог" },
	{ value: "out_of_stock", label: "Дууссан" },
];

/** Badge status follows the legacy rule: zero stock reads as out of stock. */
export function displayStatus(
	status: ProductStatus,
	stock: number,
): ProductStatus {
	return stock === 0 ? "out_of_stock" : status;
}

const mnNumber = new Intl.NumberFormat("mn-MN");

export function formatPrice(value: number): string {
	return `${mnNumber.format(value)}₮`;
}
