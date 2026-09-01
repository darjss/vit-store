import {
	ArrowRightIcon as IconArrowRight,
	SadCircleIcon as IconEmotionSad,
	FolderIcon as IconFolder,
	MinimalisticMagnifierIcon as IconSearch,
	ShopIcon as IconStore,
} from "@solar-icons/solid/linear";
import type { Component } from "solid-js";
import { createEffect, For, Match, Show, Switch } from "solid-js";
import ProductCard from "@/components/product/product-card";
import { trackSearchResultClicked } from "@/lib/analytics";
import PopularCategories from "./popular-categories";
import { useSearchStorefront } from "./use-search-storefront";

interface SearchResultsProps {
	onLoadingChange?: (isLoading: boolean) => void;
	onProductClick?: () => void;
	searchQuery: string;
}

const SearchResults: Component<SearchResultsProps> = (props) => {
	const search = useSearchStorefront(() => props.searchQuery, { limit: 8 });

	createEffect(() => {
		props.onLoadingChange?.(search.isFetching());
	});

	const hasNavigationResults = () =>
		(search.data()?.brands.length ?? 0) > 0 || (search.data()?.categories.length ?? 0) > 0;

	const handleProductClick = (productId: number, productName: string, position: number) => {
		const searchId = search.searchId();
		if (searchId) {
			trackSearchResultClicked(searchId, props.searchQuery, productId, productName, position);
		}
		props.onProductClick?.();
	};

	return (
		<div class="mt-4 sm:mt-6">
			<Switch>
				{/* Loading State */}
				<Match when={search.isLoading()}>
					<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
						<For each={Array(4)}>
							{() => (
								<div class="border-border bg-card shadow-soft animate-pulse overflow-hidden rounded-2xl border">
									<div class="bg-muted aspect-4/5" />
									<div class="space-y-2 p-3">
										<div class="bg-muted h-3 w-1/3 rounded" />
										<div class="bg-muted h-4 w-3/4 rounded" />
										<div class="flex items-end justify-between pt-2">
											<div class="bg-muted h-5 w-1/3 rounded" />
											<div class="bg-muted h-11 w-11 rounded-full" />
										</div>
									</div>
								</div>
							)}
						</For>
					</div>
				</Match>

				{/* Error State */}
				<Match when={search.isError()}>
					<div class="enter-fade flex flex-col items-center justify-center py-8 text-center">
						<IconEmotionSad class="text-muted-foreground mb-3 h-10 w-10" />
						<p class="text-muted-foreground/70 font-semibold">
							Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.
						</p>
						<button
							class="border-border bg-card shadow-soft-sm hover:shadow-soft mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border px-5 text-sm font-semibold transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
							onClick={() => search.refetch()}
							type="button"
						>
							Дахин хайх
						</button>
					</div>
				</Match>

				{/* Empty State */}
				<Match
					when={search.data() && search.data()?.products.length === 0 && !hasNavigationResults()}
				>
					<div class="enter-fade">
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<IconSearch class="text-muted-foreground mb-3 h-10 w-10" />
							<p class="text-muted-foreground/70 font-semibold">
								"{props.searchQuery}" хайлтаар үр дүн олдсонгүй
							</p>
							<p class="text-muted-foreground/80 mt-1 text-sm">
								Доорх ангилалуудаас сонгож үзнэ үү
							</p>
						</div>
						<PopularCategories />
					</div>
				</Match>

				{/* Results */}
				<Match
					when={
						search.data() && ((search.data()?.products.length ?? 0) > 0 || hasNavigationResults())
					}
				>
					<div>
						<Show when={hasNavigationResults()}>
							<div class="enter-fade mb-4 space-y-3" style={{ "transition-duration": "250ms" }}>
								<Show when={(search.data()?.brands.length ?? 0) > 0}>
									<div>
										<p class="text-muted-foreground/80 mb-2 text-[11px] font-semibold tracking-wide uppercase">
											Брэнд
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={search.data()?.brands ?? []}>
												{(brand) => (
													<a
														class="border-border bg-card text-foreground shadow-soft-sm hover:shadow-soft inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
														href={`/products/brand/${brand.slug}/1/`}
														onClick={props.onProductClick}
													>
														<IconStore class="h-4 w-4 shrink-0" />
														<span>{brand.name}</span>
														<Show when={brand.productCount !== undefined}>
															<span class="text-muted-foreground/55 font-semibold">
																{brand.productCount}
															</span>
														</Show>
													</a>
												)}
											</For>
										</div>
									</div>
								</Show>
								<Show when={(search.data()?.categories.length ?? 0) > 0}>
									<div>
										<p class="text-muted-foreground/80 mb-2 text-[11px] font-semibold tracking-wide uppercase">
											Ангилал
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={search.data()?.categories ?? []}>
												{(category) => (
													<a
														class="border-border bg-card text-foreground shadow-soft-sm hover:shadow-soft inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-[box-shadow,transform] duration-200 ease-out active:scale-[0.97]"
														href={`/products/category/${category.slug}/1/`}
														onClick={props.onProductClick}
													>
														<IconFolder class="h-4 w-4 shrink-0" />
														<span>{category.name}</span>
														<Show when={category.productCount !== undefined}>
															<span class="text-muted-foreground/55 font-semibold">
																{category.productCount}
															</span>
														</Show>
													</a>
												)}
											</For>
										</div>
									</div>
								</Show>
							</div>
						</Show>
						{/* Results Header */}
						<Show when={(search.data()?.products.length ?? 0) > 0}>
							<div class="mb-3 flex items-center justify-between px-1">
								<p class="text-muted-foreground/70 text-xs font-semibold tracking-wide uppercase">
									{search.data()?.products.length} бүтээгдэхүүн
								</p>
								<a
									class="text-foreground hover:text-muted-foreground flex items-center gap-1 text-xs font-semibold transition-colors duration-150"
									href={`/products/?q=${encodeURIComponent(props.searchQuery)}`}
									onClick={props.onProductClick}
								>
									Бүгдийг үзэх <IconArrowRight class="h-3 w-3" />
								</a>
							</div>
						</Show>

						{/* Products Grid — same card as the catalog */}
						<div class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
							<For each={search.data()?.products ?? []}>
								{(product, index) => (
									<div
										class="enter-rise"
										style={{
											"--enter-delay": `${Math.min(index(), 8) * 40}ms`,
											"transition-duration": "250ms",
										}}
									>
										<ProductCard
											onInteract={() => handleProductClick(product.id, product.name, index())}
											product={product}
										/>
									</div>
								)}
							</For>
						</div>
					</div>
				</Match>
			</Switch>
		</div>
	);
};

export default SearchResults;
