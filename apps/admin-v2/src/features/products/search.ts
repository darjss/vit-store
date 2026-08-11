import { useNavigate, useSearch } from "@tanstack/solid-router";
import { createMemo } from "solid-js";

import type { ProductStatus } from "./types";

/**
 * Filters and sort live in typed URL search params (deep-linkable and
 * back-button-safe). The products route registers no validateSearch, so the
 * raw router search is parsed defensively here: values arrive JSON-parsed
 * (numbers stay numbers, plain strings stay strings).
 */
export interface ProductListSearch {
	brandId?: number;
	categoryId?: number;
	status?: ProductStatus;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	searchTerm?: string;
}

type RawSearch = Record<string, unknown>;

const PRODUCT_STATUSES = ["active", "draft", "out_of_stock"] as const;

function optionalInt(raw: unknown): number | undefined {
	if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
	if (typeof raw === "string" && raw.trim() !== "") {
		const value = Number(raw);
		if (Number.isInteger(value) && value > 0) return value;
	}
	return undefined;
}

export function parseProductListSearch(raw: RawSearch): ProductListSearch {
	const out: ProductListSearch = {};
	const brandId = optionalInt(raw.brandId);
	const categoryId = optionalInt(raw.categoryId);
	if (brandId !== undefined) out.brandId = brandId;
	if (categoryId !== undefined) out.categoryId = categoryId;
	if (
		typeof raw.status === "string" &&
		(PRODUCT_STATUSES as readonly string[]).includes(raw.status)
	) {
		out.status = raw.status as ProductStatus;
	}
	if (typeof raw.sortField === "string" && raw.sortField !== "") {
		out.sortField = raw.sortField;
	}
	if (raw.sortDirection === "asc" || raw.sortDirection === "desc") {
		out.sortDirection = raw.sortDirection;
	}
	if (typeof raw.searchTerm === "string") {
		out.searchTerm = raw.searchTerm;
	}
	return out;
}

export function useProductListSearch(): () => ProductListSearch {
	const search = useSearch({
		from: "/_app/products/",
	}) as unknown as () => RawSearch;
	return createMemo(() => parseProductListSearch(search()));
}

export function useProductListNavigate() {
	const navigate = useNavigate();
	return (patch: Partial<ProductListSearch>, options?: { replace?: boolean }) =>
		navigate({
			to: "/products",
			replace: options?.replace,
			search: (prev: object) => ({
				...(prev as RawSearch),
				...patch,
			}),
		});
}
