import {
	ArrowRightIcon as IconArrowRight,
	AltArrowRightIcon as IconChevron,
	FolderIcon as IconFolder,
} from "@solar-icons/solid/linear";
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
import { queryClient } from "@/lib/query";
import { clearHistory, getRecentSearches, type SearchHistoryItem } from "@/lib/search-history";
import { parseSearchTokens } from "@/lib/search-parse";
import { api } from "@/lib/trpc";
import { washBg } from "@/lib/wash";
import SearchResultRow from "./search-result-row";
import { getSearchTakeoverRequestState } from "./search-takeover-state";
import { useSearchStorefront } from "./use-search-storefront";

interface SearchTakeoverProps {
	onClose: () => void;
	onSearchLoadingChange?: (loading: boolean) => void;
	onSelectSuggestion: (term: string) => void;
	query: string;
}

interface CategoryStock {
	id: number;
	name: string;
	productCount: number;
	slug: string;
}

const TOKEN_KEY = {
	dose: "Тун",
	form: "Хэлбэр",
	type: "Төрөл",
} satisfies Record<"dose" | "form" | "type", string>;

const SectionLabel = (props: { children: JSX.Element }) => (
	<div class="text-muted-foreground mt-5 mb-2.5 flex items-center gap-2 text-[11px] font-extrabold tracking-wide uppercase">
		<span>{props.children}</span>
		<span class="bg-border h-px flex-1" />
	</div>
);

const RecentGrid = (props: { onSelect: (term: string) => void }) => {
	const [recents, setRecents] = createSignal<Array<SearchHistoryItem>>([]);

	onMount(() => setRecents(getRecentSearches()));

	const handleClear = () => {
		clearHistory();
		setRecents([]);
	};

	return (
		<Show when={recents().length > 0}>
			<section class="mt-4">
				<header class="mb-2.5 flex items-center justify-between">
					<h2 class="text-muted-foreground text-[11px] font-extrabold tracking-wide uppercase">
						Сүүлд хайсан
					</h2>
					<button
						class="text-cocoa -my-2 inline-flex min-h-11 items-center px-1 text-[11px] font-semibold underline underline-offset-2"
						onClick={handleClear}
						type="button"
					>
						Цэвэрлэх
					</button>
				</header>
				<div class="grid grid-cols-2 gap-2">
					<For each={recents()}>
						{(item) => (
							<button
								class="border-border bg-card shadow-soft-sm hover:shadow-soft flex min-h-14 items-center gap-2.5 rounded-xl border px-2.5 text-left transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
								onClick={() => props.onSelect(item.term)}
								type="button"
							>
								<span
									class={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${washBg(item.term)}`}
								>
									<IconFolder class="text-foreground/70 h-5 w-5" />
								</span>
								<span class="min-w-0 truncate text-sm font-bold">{item.term}</span>
							</button>
						)}
					</For>
				</div>
			</section>
		</Show>
	);
};

const TrendingPills = (props: {
	categories: Array<CategoryStock>;
	onSelect: (term: string) => void;
}) => (
	<Show when={props.categories.length > 0}>
		<section>
			<SectionLabel>🔥 Түгээмэл хайлт</SectionLabel>
			<div class="flex flex-wrap gap-2">
				<For each={props.categories}>
					{(category, index) => (
						<button
							class={`flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97] ${
								index() === 0
									? "bg-primary shadow-lift"
									: "border-border bg-card shadow-soft-sm hover:shadow-soft border"
							}`}
							onClick={() => props.onSelect(category.name)}
							type="button"
						>
							<span class="font-display text-foreground/60 text-xs">{index() + 1}</span>
							{category.name}
						</button>
					)}
				</For>
			</div>
		</section>
	</Show>
);

const JumpList = (props: { categories: Array<CategoryStock>; onNavigate: () => void }) => (
	<Show when={props.categories.length > 0}>
		<div class="flex flex-col gap-2">
			<For each={props.categories}>
				{(category) => (
					<a
						class="border-border bg-card shadow-soft-sm hover:shadow-soft flex min-h-12 items-center gap-2.5 rounded-xl border px-3 transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
						href={`/products?category=${category.id}`}
						onClick={() => props.onNavigate()}
					>
						<span
							class={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${washBg(category.id)}`}
						>
							<IconFolder class="text-foreground/70 h-5 w-5" />
						</span>
						<span class="min-w-0 flex-1 truncate text-sm font-bold">{category.name}</span>
						<span class="text-muted-foreground text-[11px] font-semibold">
							{category.productCount}
						</span>
						<IconChevron class="text-muted-foreground h-4 w-4" />
					</a>
				)}
			</For>
		</div>
	</Show>
);

const FacetChip = (props: {
	count?: number;
	href: string;
	label: string;
	onNavigate: () => void;
}) => (
	<a
		class="border-border bg-card shadow-soft-sm flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold whitespace-nowrap transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
		href={props.href}
		onClick={() => props.onNavigate()}
	>
		{props.label}
		<Show when={props.count !== undefined}>
			<span class="bg-muted rounded-full px-1.5 py-0.5 text-[11px] font-extrabold">
				{props.count}
			</span>
		</Show>
	</a>
);

const ResultSkeleton = () => (
	<div class="mt-3 flex flex-col gap-2.5">
		<For each={Array(4)}>
			{() => (
				<div class="border-border bg-card shadow-soft flex items-center gap-3 rounded-2xl border p-2.5">
					<div class="bg-muted h-16 w-16 shrink-0 animate-pulse rounded-xl" />
					<div class="flex-1 space-y-2">
						<div class="bg-muted h-2.5 w-1/4 animate-pulse rounded" />
						<div class="bg-muted h-3.5 w-3/4 animate-pulse rounded" />
						<div class="bg-muted h-4 w-1/3 animate-pulse rounded" />
					</div>
					<div class="bg-muted h-11 w-11 shrink-0 animate-pulse rounded-full" />
				</div>
			)}
		</For>
	</div>
);

const SearchError = (props: { onRetry: () => void; query: string }) => (
	<div class="flex flex-col items-center justify-center py-10 text-center" role="alert">
		<h3 class="font-display text-lg font-bold">Хайлтыг ачаалж чадсангүй</h3>
		<p class="text-muted-foreground mt-2 max-w-[280px] text-sm">
			«{props.query}» хайлтыг ачаалж чадсангүй. Дахин оролдоно уу.
		</p>
		<button
			class="border-cocoa bg-primary shadow-lift mt-4 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-transform duration-200 ease-out active:scale-[0.97]"
			onClick={props.onRetry}
			type="button"
		>
			Дахин хайх
		</button>
	</div>
);

const SearchRefetchError = (props: { isFetching: boolean; onRetry: () => void }) => (
	<div
		class="border-border bg-card shadow-soft-sm mt-3 flex items-center justify-between gap-3 rounded-xl border p-3"
		role="alert"
	>
		<p class="text-muted-foreground text-xs">
			Хайлтыг шинэчилж чадсангүй. Одоогийн илэрцийг харуулж байна.
		</p>
		<button
			class="border-cocoa bg-primary inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-bold transition-opacity disabled:opacity-60"
			disabled={props.isFetching}
			onClick={props.onRetry}
			type="button"
		>
			{props.isFetching ? "Шинэчилж байна…" : "Дахин оролдох"}
		</button>
	</div>
);

const SearchTakeover = (props: SearchTakeoverProps) => {
	const categoriesQuery = useQuery(
		() => ({
			queryFn: () => api.category.getAllCategoriesWithStock.query(),
			queryKey: ["popular-categories"],
			staleTime: 1000 * 60 * 30,
		}),
		() => queryClient,
	);

	const search = useSearchStorefront(() => props.query, { limit: 8 });

	const topCategories = createMemo<Array<CategoryStock>>(() =>
		(categoriesQuery.data ?? []).filter((c) => c.productCount > 0).slice(0, 6),
	);
	const jumpCategories = createMemo<Array<CategoryStock>>(() => topCategories().slice(0, 3));
	const tokens = createMemo(() => parseSearchTokens(props.query));

	createEffect(() => {
		props.onSearchLoadingChange?.(search.isLoading());
	});

	const hasNavigation = () =>
		(search.data()?.brands.length ?? 0) > 0 || (search.data()?.categories.length ?? 0) > 0;

	const isZeroResults = () =>
		props.query.length >= 2 &&
		!!search.data() &&
		search.data()?.products.length === 0 &&
		!hasNavigation();

	const resultCount = () => search.data()?.products.length ?? 0;
	const requestState = createMemo(() =>
		getSearchTakeoverRequestState({
			fetchStatus: search.fetchStatus(),
			hasCurrentData: search.data() !== undefined,
			isLoadingError: search.isLoadingError(),
			isRefetchError: search.isRefetchError(),
			status: search.status(),
		}),
	);

	return (
		<Show
			fallback={
				<div>
					<RecentGrid onSelect={props.onSelectSuggestion} />
					<TrendingPills categories={topCategories()} onSelect={props.onSelectSuggestion} />
					<section>
						<SectionLabel>Ангилал руу шууд</SectionLabel>
						<JumpList categories={jumpCategories()} onNavigate={props.onClose} />
					</section>
				</div>
			}
			when={props.query.length >= 2}
		>
			<Switch>
				<Match when={requestState() === "loading"}>
					<ResultSkeleton />
				</Match>

				<Match when={requestState() === "error"}>
					<SearchError onRetry={search.refetch} query={props.query} />
				</Match>

				<Match when={isZeroResults()}>
					<div>
						<div class="flex flex-col items-center gap-2 py-9 text-center">
							<span class="text-[44px] leading-none">🔍</span>
							<h3 class="font-display text-lg font-bold">Илэрц олдсонгүй</h3>
							<p class="text-muted-foreground max-w-[280px] text-sm">
								«{props.query}»-д тохирох бараа алга.
							</p>
						</div>
						<section>
							<SectionLabel>Ойролцоо ангилал</SectionLabel>
							<JumpList categories={jumpCategories()} onNavigate={props.onClose} />
						</section>
						<TrendingPills categories={topCategories()} onSelect={props.onSelectSuggestion} />
					</div>
				</Match>

				<Match when={search.data()}>
					<div>
						<Show when={search.isRefetchError()}>
							<SearchRefetchError isFetching={search.isFetching()} onRetry={search.refetch} />
						</Show>

						<Show when={tokens().length > 0}>
							<div class="border-cocoa bg-primary/15 shadow-soft-sm mt-1 rounded-2xl border p-3.5">
								<div class="text-cocoa mb-2 flex items-center gap-1.5 text-xs font-extrabold tracking-wide uppercase">
									✨ Ухаалаг тайлбар
								</div>
								<div class="flex flex-wrap gap-2">
									<For each={tokens()}>
										{(token) => (
											<span class="border-border bg-card shadow-soft-sm flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold">
												<span class="text-muted-foreground text-[10px] font-extrabold uppercase">
													{TOKEN_KEY[token.kind]}
												</span>
												{token.label}
											</span>
										)}
									</For>
								</div>
							</div>
						</Show>

						<div class="-mx-1 mt-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden">
							<span class="border-cocoa bg-secondary text-secondary-foreground flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold">
								Урьдчилсан
								<span class="rounded-full bg-white/25 px-1.5 py-0.5 text-[11px] font-extrabold">
									{resultCount()}
								</span>
							</span>
							<For each={search.data()?.categories ?? []}>
								{(category) => (
									<FacetChip
										count={category.productCount}
										href={`/products?category=${category.id}`}
										label={category.name}
										onNavigate={props.onClose}
									/>
								)}
							</For>
							<For each={search.data()?.brands ?? []}>
								{(brand) => (
									<FacetChip
										count={brand.productCount}
										href={`/products?brand=${brand.id}`}
										label={brand.name}
										onNavigate={props.onClose}
									/>
								)}
							</For>
						</div>

						<p class="text-muted-foreground mt-3.5 mb-2 text-xs font-semibold">
							<b class="font-display text-foreground text-sm">{resultCount()}</b> бүтээгдэхүүнийг
							урьдчилан харуулж байна · «{props.query}»
						</p>

						<div class="flex flex-col gap-2.5">
							<For each={search.data()?.products ?? []}>
								{(product, index) => (
									<SearchResultRow
										onNavigate={props.onClose}
										position={index()}
										product={product}
										query={props.query}
										searchId={search.searchId()}
									/>
								)}
							</For>
						</div>

						<Show when={resultCount() > 0}>
							<a
								class="border-cocoa bg-primary font-display shadow-lift mt-3 flex min-h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition-transform duration-200 ease-out active:scale-[0.97]"
								href={`/products/?q=${encodeURIComponent(props.query)}`}
							>
								Каталогийн бүх илэрцийг харах
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
