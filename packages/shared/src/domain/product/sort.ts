import * as v from "valibot";

export const PRODUCT_SORT_FIELDS = ["price", "createdAt"] as const;
export const PRODUCT_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type ProductSortDirection = (typeof PRODUCT_SORT_DIRECTIONS)[number];

export interface SortSelection {
	direction: ProductSortDirection;
	field: ProductSortField;
}

const sortSelectionSchema = v.object({
	direction: v.picklist(PRODUCT_SORT_DIRECTIONS),
	field: v.picklist(PRODUCT_SORT_FIELDS),
});

/**
 * Parse and validate a sort field + direction pair (typically from URL params)
 * into a normalized {@link SortSelection}, or `null` if either value is absent
 * or not one of the allowed enum values. The single source of truth for sort
 * validation across the catalog list, filter drawer, and SEO sort routes.
 */
export const parseSort = (
	field?: string | null,
	direction?: string | null,
): SortSelection | null => {
	if (field == null || direction == null) {
		return null;
	}
	const parsed = v.safeParse(sortSelectionSchema, { direction, field });
	return parsed.success ? parsed.output : null;
};
