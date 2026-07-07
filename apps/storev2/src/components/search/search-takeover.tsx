import { useQuery } from "@tanstack/solid-query";
import type { JSX } from "solid-js";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Match,
	onMount,
	Show,
	Switch,
} from "solid-js";
import { trackSearchPerformed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import {
	clearHistory,
	getRecentSearches,
	type SearchHistoryItem,
} from "@/lib/search-history";
import { parseSearchTokens } from "@/lib/search-parse";
import { api } from "@/lib/trpc";
import { WASH_BG, washFor } from "@/lib/wash";
import IconArrowRight from "~icons/ri/arrow-right-line";
import IconChevron from "~icons/ri/arrow-right-s-line";
import IconFolder from "~icons/ri/folder-line";
import SearchResultRow from "./search-result-row";

interface SearchTakeoverProps {
	query: string;
	onSelectSuggestion: (term: string) => void;
	onClose: () => void;
	onSearchLoadingChange?: (loading: boolean) => void;
}

interface CategoryStock {
	id: number;
	name: string;
	slug: string;
	productCount: number;
}

const TOKEN_KEY: Record<"dose" | "form" | "type", string> = {
	dose: "Тун",
	form: "Хэлбэр",
	type: "Төрөл",
};

const SectionLabel = (props: { children: JSX.Element }) => (
	<div class="mt-5 mb-2.5 flex items-center gap-2 font-extrabold text-[11px] text-muted-foreground uppercase tracking-wide">
		<span>{props.children}</span>
		<span class="h-px flex-1 bg-border" />
	</div>
);

const RecentGrid = (props: { onSelect: (term: string) => void }) => {
	const [recents, setRecents] = createSignal<SearchHistoryItem[]>([]);

	onMount(() => setRecents(getRecentSearches()));

	const handleClear = () => {
		clearHistory();
		setRecents([]);
	};

	return (
		<Show when={recents().length > 0}>
			<section class="mt-4">
				<header class="mb-2.5 flex items-center justify-between">
					<h2 class="font-extrabold text-[11px] text-muted-foreground uppercase tracking-wide">
						Сүүлд хайсан
					</h2>
					<button
						type="button"
						onClick={handleClear}
						class="-my-2 inline-flex min-h-11 items-center px-1 font-semibold text-[11px] text-cocoa underline underline-offset-2"
					>
						Цэвэрлэх
					</button>
				</header>
				<div class="grid grid-cols-2 gap-2">
					<For each={recents()}>
						{(item) => (
							<button
								type="button"
								onClick={() => props.onSelect(item.term)}
								class="flex min-h-14 items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 text-left shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
							>
								<span
									class={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${WASH_BG[washFor(item.term)]}`}
								>
									<IconFolder class="h-5 w-5 text-foreground/70" />
								</span>
								<span class="min-w-0 truncate font-bold text-sm">
									{item.term}
								</span>
							</button>
						)}
					</For>
				</div>
			</section>
		</Show>
	);
};

const TrendingPills = (props: {
	categories: CategoryStock[];
	onSelect: (term: string) => void;
}) => (
	<Show when={props.categories.length > 0}>
		<section>
			<SectionLabel>🔥 Түгээмэл хайлт</SectionLabel>
			<div class="flex flex-wrap gap-2">
				<For each={props.categories}>
					{(category, index) => (
						<button
							type="button"
							onClick={() => props.onSelect(category.name)}
							class={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 font-semibold text-sm transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97] ${
								index() === 0
									? "bg-primary shadow-lift"
									: "border border-border bg-card shadow-soft-sm hover:shadow-soft"
							}`}
						>
							<span class="font-display text-foreground/60 text-xs">
								{index() + 1}
							</span>
							{category.name}
						</button>
					)}
				</For>
			</div>
		</section>
	</Show>
);

const JumpList = (props: {
	categories: CategoryStock[];
	onNavigate: () => void;
}) => (
	<Show when={props.categories.length > 0}>
		<div class="flex flex-col gap-2">
			<For each={props.categories}>
				{(category) => (
					<a
						href={`/products?category=${category.id}`}
						onClick={() => props.onNavigate()}
						class="flex min-h-12 items-center gap-2.5 rounded-xl border border-border bg-card px-3 shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
					>
						<span
							class={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${WASH_BG[washFor(category.id)]}`}
						>
							<IconFolder class="h-5 w-5 text-foreground/70" />
						</span>
						<span class="min-w-0 flex-1 truncate font-bold text-sm">
							{category.name}
						</span>
						<span class="font-semibold text-[11px] text-muted-foreground">
							{category.productCount}
						</span>
						<IconChevron class="h-4 w-4 text-muted-foreground" />
					</a>
				)}
			</For>
		</div>
	</Show>
);

const FacetChip = (props: {
	label: string;
	count?: number;
	href: string;
	onNavigate: () => void;
}) => (
	<a
		href={props.href}
		onClick={() => props.onNavigate()}
		class="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3.5 font-semibold text-xs shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
	>
		{props.label}
		<Show when={props.count !== undefined}>
			<span class="rounded-full bg-muted px-1.5 py-0.5 font-extrabold text-[11px]">
				{props.count}
			</span>
		</Show>
	</a>
);

const ResultSkeleton = () => (
	<div class="mt-3 flex flex-col gap-2.5">
		<For each={Array(4)}>
			{() => (
				<div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-soft">
					<div class="h-16 w-16 shrink-0 animate-pulse rounded-xl bg-muted" />
					<div class="flex-1 space-y-2">
						<div class="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
						<div class="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
						<div class="h-4 w-1/3 animate-pulse rounded bg-muted" />
					</div>
					<div class="h-11 w-11 shrink-0 animate-pulse rounded-full bg-muted" />
				</div>
			)}
		</For>
	</div>
);

const SearchTakeover = (props: SearchTakeoverProps) => {
	const categoriesQuery = useQuery(
		() => ({
			queryKey: ["popular-categories"],
			queryFn: () => api.category.getAllCategoriesWithStock.query(),
			staleTime: 1000 * 60 * 30,
		}),
		() => queryClient,
	);

	const searchResults = useQuery(
		() => ({
			queryKey: ["search-takeover", props.query],
			queryFn: async () => {
				if (props.query.length < 2) {
					return { products: [], brands: [], categories: [] };
				}
				return await api.product.searchStorefront.query({
					query: props.query,
					limit: 8,
				});
			},
			enabled: props.query.length >= 2,
			staleTime: 1000 * 60 * 5,
		}),
		() => queryClient,
	);

	const topCategories = createMemo<CategoryStock[]>(() =>
		(categoriesQuery.data ?? []).filter((c) => c.productCount > 0).slice(0, 6),
	);
	const jumpCategories = createMemo<CategoryStock[]>(() =>
		topCategories().slice(0, 3),
	);
	const tokens = createMemo(() => parseSearchTokens(props.query));

	createEffect(() => {
		if (
			searchResults.data &&
			!searchResults.isFetching &&
			props.query.length >= 2
		) {
			trackSearchPerformed(props.query, searchResults.data.products.length);
		}
	});

	createEffect(() => {
		props.onSearchLoadingChange?.(searchResults.isLoading);
	});

	const hasNavigation = () =>
		(searchResults.data?.brands.length ?? 0) > 0 ||
		(searchResults.data?.categories.length ?? 0) > 0;

	const isZeroResults = () =>
		props.query.length >= 2 &&
		!!searchResults.data &&
		searchResults.data.products.length === 0 &&
		!hasNavigation();

	const resultCount = () => searchResults.data?.products.length ?? 0;

	return (
		<Show
			when={props.query.length >= 2}
			fallback={
				<div>
					<RecentGrid onSelect={props.onSelectSuggestion} />
					<TrendingPills
						categories={topCategories()}
						onSelect={props.onSelectSuggestion}
					/>
					<section>
						<SectionLabel>Ангилал руу шууд</SectionLabel>
						<JumpList
							categories={jumpCategories()}
							onNavigate={props.onClose}
						/>
					</section>
				</div>
			}
		>
			<Switch>
				<Match when={searchResults.isLoading}>
					<ResultSkeleton />
				</Match>

				<Match when={searchResults.isError}>
					<div class="flex flex-col items-center justify-center py-10 text-center">
						<p class="font-semibold text-muted-foreground">
							Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.
						</p>
						<button
							type="button"
							onClick={() => searchResults.refetch()}
							class="mt-4 inline-flex min-h-11 items-center rounded-full border border-border bg-card px-5 font-semibold text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
						>
							Дахин хайх
						</button>
					</div>
				</Match>

				<Match when={isZeroResults()}>
					<div>
						<div class="flex flex-col items-center gap-2 py-9 text-center">
							<span class="text-[44px] leading-none">🔍</span>
							<h3 class="font-bold font-display text-lg">Илэрц олдсонгүй</h3>
							<p class="max-w-[280px] text-muted-foreground text-sm">
								«{props.query}»-д тохирох бараа алга.
							</p>
						</div>
						<section>
							<SectionLabel>Ойролцоо ангилал</SectionLabel>
							<JumpList
								categories={jumpCategories()}
								onNavigate={props.onClose}
							/>
						</section>
						<TrendingPills
							categories={topCategories()}
							onSelect={props.onSelectSuggestion}
						/>
					</div>
				</Match>

				<Match when={searchResults.data}>
					<div>
						<Show when={tokens().length > 0}>
							<div class="mt-1 rounded-2xl border border-cocoa bg-primary/15 p-3.5 shadow-soft-sm">
								<div class="mb-2 flex items-center gap-1.5 font-extrabold text-cocoa text-xs uppercase tracking-wide">
									✨ Ухаалаг тайлбар
								</div>
								<div class="flex flex-wrap gap-2">
									<For each={tokens()}>
										{(token) => (
											<span class="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 font-semibold text-xs shadow-soft-sm">
												<span class="font-extrabold text-[10px] text-muted-foreground uppercase">
													{TOKEN_KEY[token.kind]}
												</span>
												{token.label}
											</span>
										)}
									</For>
								</div>
							</div>
						</Show>

						<div class="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							<span class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-cocoa bg-secondary px-3.5 font-semibold text-secondary-foreground text-xs">
								Бүгд
								<span class="rounded-full bg-white/25 px-1.5 py-0.5 font-extrabold text-[11px]">
									{resultCount()}
								</span>
							</span>
							<For each={searchResults.data?.categories ?? []}>
								{(category) => (
									<FacetChip
										label={category.name}
										count={category.productCount}
										href={`/products?category=${category.id}`}
										onNavigate={props.onClose}
									/>
								)}
							</For>
							<For each={searchResults.data?.brands ?? []}>
								{(brand) => (
									<FacetChip
										label={brand.name}
										count={brand.productCount}
										href={`/products?brand=${brand.id}`}
										onNavigate={props.onClose}
									/>
								)}
							</For>
						</div>

						<p class="mt-3.5 mb-2 font-semibold text-muted-foreground text-xs">
							<b class="font-display text-foreground text-sm">
								{resultCount()}
							</b>{" "}
							илэрц · «{props.query}»
						</p>

						<div class="flex flex-col gap-2.5">
							<For each={searchResults.data?.products ?? []}>
								{(product, index) => (
									<SearchResultRow
										product={product}
										query={props.query}
										position={index()}
										onNavigate={props.onClose}
									/>
								)}
							</For>
						</div>

						<Show when={resultCount() > 0}>
							<a
								href={`/products/?q=${encodeURIComponent(props.query)}`}
								onClick={() => props.onClose()}
								class="mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-cocoa bg-primary font-bold font-display text-sm shadow-lift transition-transform duration-200 ease-out active:scale-[0.97]"
							>
								Каталогоос бүх {resultCount()} илэрц харах
								<IconArrowRight class="h-4 w-4" />
							</a>
						</Show>
					</div>
				</Match>
			</Switch>
		</Show>
	);
};

export default SearchTakeover;
