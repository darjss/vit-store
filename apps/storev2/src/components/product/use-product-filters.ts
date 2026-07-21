import { formatCurrency } from "@vit/shared";
import {
	productPresetFilterLabels,
	productSortOptions,
	type ProductPresetFilter,
	type SortSelection,
	parseSort,
} from "@vit/shared/domain/product";
import { batch, createMemo } from "solid-js";
import { useSearchParam } from "@/lib/useSearchParam";
import { PRICE_MAX, PRICE_MIN } from "./filter-drawer";
import { getEffectiveProductSearchTerm } from "./search-mode";

type ListFilter = ProductPresetFilter;

export interface AppliedChip {
	key: string;
	label: string;
	onRemove: () => void;
}

export interface ApplyFiltersPayload {
	sortField: string | null;
	sortDirection: string | null;
	categoryId: number | null;
	brandId: number | null;
	priceRange: [number, number];
	includeOutOfStock: boolean;
}

export interface ProductFilters {
	effectiveSearchTerm: () => string | null;
	setSearchTerm: (value: string | null) => void;
	sortField: () => string | null;
	sortDirection: () => string | null;
	listFilter: () => ListFilter | null;
	categoryId: () => number | null;
	brandId: () => number | null;
	priceRange: () => [number, number];
	minPrice: () => number | undefined;
	maxPrice: () => number | undefined;
	inStockOnly: () => boolean;
	includeOutOfStock: () => boolean;
	selectedSort: () => SortSelection | null;
	isSearchMode: () => boolean;
	isBrowsingAll: () => boolean;
	hasActiveFilters: () => boolean;
	activeFilterCount: () => number;
	appliedChips: () => AppliedChip[];
	categoryLabel: () => string | null;
	brandLabel: () => string | null;
	presetLabel: () => string | null;
	pageTitle: () => string;
	applyFilters: (next: ApplyFiltersPayload) => void;
	resetDrawerFilters: () => void;
	handleClearFilters: () => void;
}

/**
 * Owns the eight catalog URL params (`q`, `sort`, `dir`, `category`, `brand`,
 * `filter`, `price`, `stock`) plus the derived filter memos, sort validation,
 * applied-chip derivation, and apply/reset/clear actions.
 *
 * Category/brand params are numeric-id only — the search takeover emits
 * `?category=<id>` and `?brand=<id>`, and the SEO routes live under
 * `/products/category/[slug]` / `/products/brand/[slug]`. Name-fallback
 * resolution is intentionally dropped: it caused a flash-of-all-products on
 * cold loads because the categories query is not awaited during SSR, and it
 * broke on renames/Cyrillic-vs-Latin/multi-word names.
 */
export function useProductFilters(args: {
	categories: () => { id: number; name: string }[] | undefined;
	brands: () => { id: number; name: string }[] | undefined;
}): ProductFilters {
	const [searchTerm, setSearchTerm] = useSearchParam("q", {
		defaultValue: undefined,
	});
	const [sortField, setSortField] = useSearchParam("sort", {
		defaultValue: undefined,
	});
	const [sortDirection, setSortDirection] = useSearchParam("dir", {
		defaultValue: undefined,
	});
	const [categoryIdParam, setCategoryIdParam] = useSearchParam("category", {
		defaultValue: undefined,
	});
	const [brandIdParam, setBrandIdParam] = useSearchParam("brand", {
		defaultValue: undefined,
	});
	const [listFilterParam, setListFilterParam] = useSearchParam("filter", {
		defaultValue: undefined,
	});
	const [priceParam, setPriceParam] = useSearchParam("price", {
		defaultValue: undefined,
	});
	const [stockParam, setStockParam] = useSearchParam("stock", {
		defaultValue: undefined,
	});

	const effectiveSearchTerm = createMemo(() =>
		getEffectiveProductSearchTerm(searchTerm()),
	);
	const isSearchMode = createMemo(() => effectiveSearchTerm() !== null);

	const listFilter = createMemo<ListFilter | null>(() => {
		const val = listFilterParam();
		if (val === "featured" || val === "recent") {
			return val;
		}
		return null;
	});

	// Numeric id only. Non-numeric values (legacy name params) resolve to null
	// instead of flashing all products while a name lookup query resolves.
	const categoryId = createMemo(() => {
		const val = categoryIdParam();
		if (!val) return null;
		const parsed = Number.parseInt(val, 10);
		return Number.isNaN(parsed) ? null : parsed;
	});

	const brandId = createMemo(() => {
		const val = brandIdParam();
		if (!val) return null;
		const parsed = Number.parseInt(val, 10);
		return Number.isNaN(parsed) ? null : parsed;
	});

	const priceRange = createMemo<[number, number]>(() => {
		const raw = priceParam();
		if (!raw) return [PRICE_MIN, PRICE_MAX];
		const [minStr, maxStr] = raw.split("-");
		const min = Number.parseInt(minStr ?? "", 10);
		const max = Number.parseInt(maxStr ?? "", 10);
		return [
			Number.isNaN(min) ? PRICE_MIN : min,
			Number.isNaN(max) ? PRICE_MAX : max,
		];
	});

	const minPrice = createMemo(() => {
		const value = priceRange()[0];
		return value <= PRICE_MIN ? undefined : value;
	});

	const maxPrice = createMemo(() => {
		const value = priceRange()[1];
		return value >= PRICE_MAX ? undefined : value;
	});

	const inStockOnly = createMemo(() => stockParam() === "instock");
	const includeOutOfStock = createMemo(() => !inStockOnly());

	const selectedSort = createMemo<SortSelection | null>(() =>
		parseSort(sortField(), sortDirection()),
	);

	const writePrice = (range: [number, number]) => {
		if (range[0] <= PRICE_MIN && range[1] >= PRICE_MAX) {
			setPriceParam(null);
			return;
		}
		setPriceParam(`${range[0]}-${range[1]}`);
	};

	const applyFilters = (next: ApplyFiltersPayload) => {
		const validSort =
			parseSort(next.sortField, next.sortDirection) !== null;
		batch(() => {
			setSortField(validSort ? next.sortField : null);
			setSortDirection(validSort ? next.sortDirection : null);
			setCategoryIdParam(next.categoryId?.toString() ?? null);
			setBrandIdParam(next.brandId?.toString() ?? null);
			writePrice(next.priceRange);
			setStockParam(next.includeOutOfStock ? null : "instock");
		});
	};

	const resetDrawerFilters = () => {
		batch(() => {
			setSortField(null);
			setSortDirection(null);
			setCategoryIdParam(null);
			setBrandIdParam(null);
			setPriceParam(null);
			setStockParam(null);
		});
	};

	const handleClearFilters = () => {
		batch(() => {
			setSearchTerm(null);
			setSortField(null);
			setSortDirection(null);
			setCategoryIdParam(null);
			setBrandIdParam(null);
			setListFilterParam(null);
			setPriceParam(null);
			setStockParam(null);
		});
	};

	const removeSort = () => {
		batch(() => {
			setSortField(null);
			setSortDirection(null);
		});
	};

	const priceLabel = createMemo(() => {
		const [min, max] = priceRange();
		if (min > PRICE_MIN && max < PRICE_MAX) {
			return `${formatCurrency(min)}–${formatCurrency(max)}`;
		}
		if (max < PRICE_MAX) return `≤ ${formatCurrency(max)}`;
		return `≥ ${formatCurrency(min)}`;
	});

	const activeFilterCount = createMemo(() => {
		let count = 0;
		if (categoryId()) count += 1;
		if (brandId()) count += 1;
		if (minPrice() !== undefined || maxPrice() !== undefined) count += 1;
		if (selectedSort()) count += 1;
		if (listFilter()) count += 1;
		if (inStockOnly()) count += 1;
		return count;
	});

	const categoryLabel = createMemo(
		() =>
			args.categories()?.find((c) => c.id === categoryId())?.name ?? null,
	);

	const brandLabel = createMemo(
		() => args.brands()?.find((b) => b.id === brandId())?.name ?? null,
	);

	const sortLabel = createMemo(() => {
		const sort = selectedSort();
		if (!sort) return null;
		return (
			productSortOptions.find(
				(o) => o.field === sort.field && o.direction === sort.direction,
			)?.label ?? null
		);
	});

	const presetLabel = createMemo(() => {
		const preset = listFilter();
		return preset ? productPresetFilterLabels[preset] : null;
	});

	const priceChipLabel = createMemo(() =>
		minPrice() !== undefined || maxPrice() !== undefined
			? priceLabel()
			: null,
	);

	const stockLabel = createMemo(() =>
		inStockOnly() ? "Зөвхөн нөөцтэй" : null,
	);

	const appliedChips = createMemo<AppliedChip[]>(() =>
		[
			{
				key: "search",
				label: effectiveSearchTerm(),
				onRemove: () => setSearchTerm(null),
			},
			{
				key: "category",
				label: categoryLabel(),
				onRemove: () => setCategoryIdParam(null),
			},
			{
				key: "brand",
				label: brandLabel(),
				onRemove: () => setBrandIdParam(null),
			},
			{
				key: "price",
				label: priceChipLabel(),
				onRemove: () => setPriceParam(null),
			},
			{ key: "sort", label: sortLabel(), onRemove: removeSort },
			{
				key: "preset",
				label: presetLabel(),
				onRemove: () => setListFilterParam(null),
			},
			{
				key: "stock",
				label: stockLabel(),
				onRemove: () => setStockParam(null),
			},
		].filter(
			(chip): chip is AppliedChip =>
				chip.label != null && chip.label !== "",
		),
	);

	const hasActiveFilters = () =>
		effectiveSearchTerm() !== null ||
		!!selectedSort() ||
		!!categoryId() ||
		!!brandId() ||
		!!listFilter() ||
		minPrice() !== undefined ||
		maxPrice() !== undefined ||
		inStockOnly();

	const isBrowsingAll = createMemo(
		() => !isSearchMode() && !hasActiveFilters(),
	);

	const pageTitle = () => {
		const term = effectiveSearchTerm();
		if (term) return `"${term}" хайлтын үр дүн`;
		return (
			presetLabel() ??
			categoryLabel() ??
			brandLabel() ??
			"Бүх бүтээгдэхүүн"
		);
	};

	return {
		effectiveSearchTerm,
		setSearchTerm,
		sortField,
		sortDirection,
		listFilter,
		categoryId,
		brandId,
		priceRange,
		minPrice,
		maxPrice,
		inStockOnly,
		includeOutOfStock,
		selectedSort,
		isSearchMode,
		isBrowsingAll,
		hasActiveFilters,
		activeFilterCount,
		appliedChips,
		categoryLabel,
		brandLabel,
		presetLabel,
		pageTitle,
		applyFilters,
		resetDrawerFilters,
		handleClearFilters,
	};
}
