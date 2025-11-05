import { createEffect, createSignal, For } from "solid-js";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { useSearchParams } from "@/hooks/use-search-params";

interface ProductFiltersProps {
	categories?: Array<{ id: number; name: string }>;
	brands?: Array<{ id: number; name: string }>;
}

/**
 * Example component demonstrating useSearchParams hook usage
 * This component manages product filtering via URL search parameters
 */
export default function ProductFilters(props: ProductFiltersProps) {
	const { get, set, remove, setMultiple, clear, has, getAll, toString } =
		useSearchParams({
			replaceState: false,
			onChange: (params) => {
				console.log("Search params changed:", Object.fromEntries(params));
			},
		});

	// Local state synced with URL params
	const [searchQuery, setSearchQuery] = createSignal(get("search") || "");
	const [selectedCategory, setSelectedCategory] = createSignal(
		get("category") || "",
	);
	const [selectedBrand, setSelectedBrand] = createSignal(get("brand") || "");
	const [minPrice, setMinPrice] = createSignal(get("minPrice") || "");
	const [maxPrice, setMaxPrice] = createSignal(get("maxPrice") || "");

	// Sync local state with URL params when they change (e.g., browser back/forward)
	createEffect(() => {
		const currentSearch = get("search") || "";
		if (currentSearch !== searchQuery()) {
			setSearchQuery(currentSearch);
		}
	});

	const handleSearchInput = (value: string) => {
		setSearchQuery(value);
		if (value) {
			set("search", value);
		} else {
			remove("search");
		}
	};

	const handleCategoryChange = (categoryId: string) => {
		setSelectedCategory(categoryId);
		if (categoryId) {
			set("category", categoryId);
		} else {
			remove("category");
		}
	};

	const handleBrandChange = (brandId: string) => {
		setSelectedBrand(brandId);
		if (brandId) {
			set("brand", brandId);
		} else {
			remove("brand");
		}
	};

	const handlePriceFilter = () => {
		const priceParams: Record<string, string> = {};
		if (minPrice()) priceParams.minPrice = minPrice();
		if (maxPrice()) priceParams.maxPrice = maxPrice();

		if (Object.keys(priceParams).length > 0) {
			setMultiple(priceParams);
		}
	};

	const handleClearFilters = () => {
		clear();
		setSearchQuery("");
		setSelectedCategory("");
		setSelectedBrand("");
		setMinPrice("");
		setMaxPrice("");
	};

	const hasActiveFilters = () => {
		return (
			has("search") ||
			has("category") ||
			has("brand") ||
			has("minPrice") ||
			has("maxPrice")
		);
	};

	return (
		<div class="space-y-6 rounded-lg border-2 border-black bg-white p-6">
			<div class="flex items-center justify-between">
				<h2 class="font-bold text-2xl">Шүүлтүүр</h2>
				{hasActiveFilters() && (
					<Button onClick={handleClearFilters} variant="outline" size="sm">
						Цэвэрлэх
					</Button>
				)}
			</div>

			{/* Search */}
			<div>
				<label class="mb-2 block font-semibold">Хайх</label>
				<TextField>
					<TextField.Input
						type="text"
						placeholder="Бүтээгдэхүүн хайх..."
						value={searchQuery()}
						onInput={(e) => handleSearchInput(e.currentTarget.value)}
					/>
				</TextField>
			</div>

			{/* Category Filter */}
			{props.categories && props.categories.length > 0 && (
				<div>
					<label class="mb-2 block font-semibold">Ангилал</label>
					<select
						class="w-full rounded-md border-2 border-black p-2"
						value={selectedCategory()}
						onChange={(e) => handleCategoryChange(e.currentTarget.value)}
					>
						<option value="">Бүгд</option>
						<For each={props.categories}>
							{(category) => (
								<option value={category.id.toString()}>{category.name}</option>
							)}
						</For>
					</select>
				</div>
			)}

			{/* Brand Filter */}
			{props.brands && props.brands.length > 0 && (
				<div>
					<label class="mb-2 block font-semibold">Брэнд</label>
					<select
						class="w-full rounded-md border-2 border-black p-2"
						value={selectedBrand()}
						onChange={(e) => handleBrandChange(e.currentTarget.value)}
					>
						<option value="">Бүгд</option>
						<For each={props.brands}>
							{(brand) => (
								<option value={brand.id.toString()}>{brand.name}</option>
							)}
						</For>
					</select>
				</div>
			)}

			{/* Price Range */}
			<div>
				<label class="mb-2 block font-semibold">Үнийн хязгаар</label>
				<div class="space-y-2">
					<TextField>
						<TextField.Input
							type="number"
							placeholder="Доод үнэ"
							value={minPrice()}
							onInput={(e) => setMinPrice(e.currentTarget.value)}
						/>
					</TextField>
					<TextField>
						<TextField.Input
							type="number"
							placeholder="Дээд үнэ"
							value={maxPrice()}
							onInput={(e) => setMaxPrice(e.currentTarget.value)}
						/>
					</TextField>
					<Button onClick={handlePriceFilter} class="w-full" variant="outline">
						Үнээр шүүх
					</Button>
				</div>
			</div>

			{/* Debug Info */}
			<div class="rounded border border-gray-300 bg-gray-50 p-3 text-xs">
				<p class="mb-1 font-semibold">Active Params:</p>
				<pre class="overflow-auto">{JSON.stringify(getAll(), null, 2)}</pre>
				<p class="mt-2">Query String: {toString()}</p>
			</div>
		</div>
	);
}
