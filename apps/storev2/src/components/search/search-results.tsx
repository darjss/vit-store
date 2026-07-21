import type { Component } from "solid-js";
import { createEffect, For, Match, Show, Switch } from "solid-js";
import ProductCard from "@/components/product/product-card";
import { trackSearchResultClicked } from "@/lib/analytics";
import IconArrowRight from "~icons/ri/arrow-right-line";
import IconEmotionSad from "~icons/ri/emotion-sad-line";
import IconFolder from "~icons/ri/folder-line";
import IconSearch from "~icons/ri/search-line";
import IconStore from "~icons/ri/store-2-line";
import PopularCategories from "./popular-categories";
import { useSearchStorefront } from "./use-search-storefront";

interface SearchResultsProps {
	searchQuery: string;
	onProductClick?: () => void;
	onLoadingChange?: (isLoading: boolean) => void;
}

const SearchResults: Component<SearchResultsProps> = (props) => {
	const search = useSearchStorefront(() => props.searchQuery, { limit: 8 });

	createEffect(() => {
		props.onLoadingChange?.(search.isFetching());
	});

	const hasNavigationResults = () =>
		(search.data()?.brands.length ?? 0) > 0 ||
		(search.data()?.categories.length ?? 0) > 0;

	const handleProductClick = (
		productId: number,
		productName: string,
		position: number,
	) => {
		trackSearchResultClicked(
			props.searchQuery,
			productId,
			productName,
			position,
		);
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
								<div class="animate-pulse overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
									<div class="aspect-4/5 bg-muted" />
									<div class="space-y-2 p-3">
										<div class="h-3 w-1/3 rounded bg-muted" />
										<div class="h-4 w-3/4 rounded bg-muted" />
										<div class="flex items-end justify-between pt-2">
											<div class="h-5 w-1/3 rounded bg-muted" />
											<div class="h-11 w-11 rounded-full bg-muted" />
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
						<IconEmotionSad class="mb-3 h-10 w-10 text-muted-foreground" />
						<p class="font-semibold text-muted-foreground/70">
							Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.
						</p>
						<button
							type="button"
							onClick={() => search.refetch()}
							class="hover:-translate-y-0.5 mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-border bg-card px-5 font-semibold text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
						>
							Дахин хайх
						</button>
					</div>
				</Match>

				{/* Empty State */}
				<Match
					when={
						search.data() &&
						search.data()!.products.length === 0 &&
						!hasNavigationResults()
					}
				>
					<div class="enter-fade">
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<IconSearch class="mb-3 h-10 w-10 text-muted-foreground" />
							<p class="font-semibold text-muted-foreground/70">
								"{props.searchQuery}" хайлтаар үр дүн олдсонгүй
							</p>
							<p class="mt-1 text-muted-foreground/80 text-sm">
								Доорх ангилалуудаас сонгож үзнэ үү
							</p>
						</div>
						<PopularCategories />
					</div>
				</Match>

				{/* Results */}
				<Match
					when={
						search.data() &&
						(search.data()!.products.length > 0 || hasNavigationResults())
					}
				>
					<div>
						<Show when={hasNavigationResults()}>
							<div
								class="enter-fade mb-4 space-y-3"
								style={{ "transition-duration": "250ms" }}
							>
								<Show when={(search.data()?.brands.length ?? 0) > 0}>
									<div>
										<p class="mb-2 font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wide">
											Брэнд
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={search.data()?.brands ?? []}>
												{(brand) => (
													<a
														href={`/products/brand/${brand.slug}/1/`}
														onClick={props.onProductClick}
														class="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-semibold text-foreground text-xs shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
													>
														<IconStore class="h-4 w-4 shrink-0" />
														<span>{brand.name}</span>
														<Show when={brand.productCount !== undefined}>
															<span class="font-semibold text-muted-foreground/55">
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
										<p class="mb-2 font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wide">
											Ангилал
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={search.data()?.categories ?? []}>
												{(category) => (
													<a
														href={`/products/category/${category.slug}/1/`}
														onClick={props.onProductClick}
														class="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-semibold text-foreground text-xs shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:shadow-soft active:scale-[0.97]"
													>
														<IconFolder class="h-4 w-4 shrink-0" />
														<span>{category.name}</span>
														<Show when={category.productCount !== undefined}>
															<span class="font-semibold text-muted-foreground/55">
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
								<p class="font-semibold text-muted-foreground/70 text-xs uppercase tracking-wide">
									{search.data()?.products.length} бүтээгдэхүүн
								</p>
								<a
									href={`/products/?q=${encodeURIComponent(props.searchQuery)}`}
									class="flex items-center gap-1 font-semibold text-foreground text-xs transition-colors duration-150 hover:text-muted-foreground"
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
										onClick={() =>
											handleProductClick(product.id, product.name, index())
										}
									>
										<ProductCard product={product} />
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
