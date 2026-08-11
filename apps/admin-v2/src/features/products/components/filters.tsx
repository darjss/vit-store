import { ArrowDownIcon } from "@solar-icons/solid/linear/arrow-down";
import { ArrowUpIcon } from "@solar-icons/solid/linear/arrow-up";
import { RefreshCircleIcon } from "@solar-icons/solid/linear/refresh-circle";
import { createQuery } from "@tanstack/solid-query";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
} from "@vit/ui";
import { For, Show } from "solid-js";

import { brandsQueryOptions, categoriesQueryOptions } from "../queries";
import type { ProductListSearch } from "../search";
import { PRODUCT_STATUS_OPTIONS, type ProductStatus } from "../types";

const STATUS_OPTIONS = [
	"",
	...PRODUCT_STATUS_OPTIONS.map((option) => option.value),
] as const;
const statusLabel = (value: string) =>
	value === ""
		? "Бүх төлөв"
		: (PRODUCT_STATUS_OPTIONS.find((option) => option.value === value)?.label ??
			value);

interface FiltersProps {
	search: () => ProductListSearch;
	onPatch: (patch: Partial<ProductListSearch>) => void;
	hasActiveFilters: () => boolean;
}

const SORT_FIELDS: Array<{ field: string; label: string }> = [
	{ field: "stock", label: "Үлдэгдэл" },
	{ field: "price", label: "Үнэ" },
	{ field: "createdAt", label: "Огноо" },
];

export function Filters(props: FiltersProps) {
	const brandsQuery = createQuery(() => brandsQueryOptions());
	const categoriesQuery = createQuery(() => categoriesQueryOptions());

	const brandOptions = () => [
		{ id: 0, name: "Бүх брэнд" },
		...(brandsQuery.data ?? []),
	];
	const categoryOptions = () => [
		{ id: 0, name: "Бүх ангилал" },
		...(categoriesQuery.data ?? []),
	];
	const selectedBrand = () =>
		brandOptions().find(
			(brand) => brand.id === (props.search().brandId ?? 0),
		) ?? null;
	const selectedCategory = () =>
		categoryOptions().find(
			(category) => category.id === (props.search().categoryId ?? 0),
		) ?? null;

	const toggleSort = (field: string) => {
		const direction =
			props.search().sortField === field &&
			props.search().sortDirection === "asc"
				? "desc"
				: "asc";
		props.onPatch({ sortField: field, sortDirection: direction });
	};

	return (
		<div class="space-y-2.5">
			<div class="grid grid-cols-2 gap-2">
				<Show
					when={brandsQuery.data}
					fallback={<Skeleton class="h-12 w-full rounded-ui" />}
				>
					<Select
						options={brandOptions()}
						optionValue={(brand) => brand.id}
						optionTextValue={(brand) => brand.name}
						itemComponent={(itemProps) => (
							<SelectItem item={itemProps.item} class="relative">
								{itemProps.item.rawValue.name}
							</SelectItem>
						)}
						value={selectedBrand()}
						onChange={(value) =>
							props.onPatch({
								brandId: value && value.id > 0 ? value.id : undefined,
							})
						}
					>
						<SelectTrigger class="min-w-0">
							<SelectValue<{ id: number; name: string }>>
								{(state) => state.selectedOption()?.name ?? "Бүх брэнд"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				</Show>

				<Show
					when={categoriesQuery.data}
					fallback={<Skeleton class="h-12 w-full rounded-ui" />}
				>
					<Select
						options={categoryOptions()}
						optionValue={(category) => category.id}
						optionTextValue={(category) => category.name}
						itemComponent={(itemProps) => (
							<SelectItem item={itemProps.item} class="relative">
								{itemProps.item.rawValue.name}
							</SelectItem>
						)}
						value={selectedCategory()}
						onChange={(value) =>
							props.onPatch({
								categoryId: value && value.id > 0 ? value.id : undefined,
							})
						}
					>
						<SelectTrigger class="min-w-0">
							<SelectValue<{ id: number; name: string }>>
								{(state) => state.selectedOption()?.name ?? "Бүх ангилал"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				</Show>
			</div>

			<Select
				options={[...STATUS_OPTIONS]}
				optionValue={(value) => value}
				optionTextValue={statusLabel}
				itemComponent={(itemProps) => (
					<SelectItem item={itemProps.item} class="relative">
						{statusLabel(itemProps.item.rawValue)}
					</SelectItem>
				)}
				value={props.search().status ?? ""}
				onChange={(value) =>
					props.onPatch({
						status: value ? (value as ProductStatus) : undefined,
					})
				}
			>
				<SelectTrigger class="min-w-0">
					<SelectValue<string>>
						{(state) => statusLabel(state.selectedOption() ?? "")}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>

			<div class="flex flex-wrap items-center gap-2">
				<Show when={props.hasActiveFilters()}>
					<Button
						variant="outline"
						size="compact"
						onClick={() =>
							props.onPatch({
								brandId: undefined,
								categoryId: undefined,
								status: undefined,
								sortField: undefined,
								sortDirection: undefined,
							})
						}
					>
						<RefreshCircleIcon />
						Шүүлтүүр цэвэрлэх
					</Button>
				</Show>
				<For each={SORT_FIELDS}>
					{(sort) => {
						const active = () => props.search().sortField === sort.field;
						const direction = () => props.search().sortDirection;
						return (
							<Button
								variant={active() ? "primary" : "outline"}
								size="compact"
								onClick={() => toggleSort(sort.field)}
							>
								{sort.label}
								<Show when={active()}>
									{direction() === "asc" ? <ArrowUpIcon /> : <ArrowDownIcon />}
								</Show>
							</Button>
						);
					}}
				</For>
			</div>
		</div>
	);
}
