export const PRODUCT_SORT_FIELDS = ["price", "createdAt"] as const;
export const PRODUCT_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];
export type ProductSortDirection = (typeof PRODUCT_SORT_DIRECTIONS)[number];

export interface SortSelection {
	field: ProductSortField;
	direction: ProductSortDirection;
}

const SORT_FIELDS = new Set<string>(PRODUCT_SORT_FIELDS);
const SORT_DIRECTIONS = new Set<string>(PRODUCT_SORT_DIRECTIONS);

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
	if (
		field !== undefined &&
		field !== null &&
		SORT_FIELDS.has(field) &&
		direction !== undefined &&
		direction !== null &&
		SORT_DIRECTIONS.has(direction)
	) {
		return {
			field: field as ProductSortField,
			direction: direction as ProductSortDirection,
		};
	}
	return null;
};
