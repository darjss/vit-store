import { useQuery } from "@tanstack/solid-query";
import { formatCurrency, productColors } from "@vit/shared";
import type { Component } from "solid-js";
import { createEffect, For, Match, Show, Switch } from "solid-js";
import AddToCartButton from "@/components/cart/add-to-cart-button";
import {
	trackSearchPerformed,
	trackSearchResultClicked,
} from "@/lib/analytics";
import { toProductImageUrl } from "@/lib/image";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconArrowRight from "~icons/ri/arrow-right-line";
import IconEmotionSad from "~icons/ri/emotion-sad-line";
import IconFolder from "~icons/ri/folder-line";
import IconSearch from "~icons/ri/search-line";
import IconStore from "~icons/ri/store-2-line";

interface SearchResultsProps {
	searchQuery: string;
	onProductClick?: () => void;
	onLoadingChange?: (isLoading: boolean) => void;
}

const SearchResults: Component<SearchResultsProps> = (props) => {
	const query = useQuery(
		() => ({
			queryKey: ["search-products", props.searchQuery],
			queryFn: async () => {
				if (!props.searchQuery || props.searchQuery.length < 2) {
					return { products: [], brands: [], categories: [] };
				}
				return await api.product.searchStorefrontWithStock.query({
					query: props.searchQuery,
					limit: 8,
				});
			},
			enabled: props.searchQuery.length >= 2,
			staleTime: 1000 * 60 * 5,
		}),
		() => queryClient,
	);

	const getProductColor = (id: number) =>
		productColors[id % productColors.length];

	createEffect(() => {
		props.onLoadingChange?.(query.isFetching);
	});

	// Track search when results are loaded
	createEffect(() => {
		if (query.data && !query.isFetching && props.searchQuery.length >= 2) {
			trackSearchPerformed(props.searchQuery, query.data.products.length);
		}
	});

	const hasNavigationResults = () =>
		(query.data?.brands.length ?? 0) > 0 ||
		(query.data?.categories.length ?? 0) > 0;

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
				<Match when={query.isLoading}>
					<div class="flex flex-col gap-3">
						<For each={Array(4)}>
							{() => (
								<div class="flex animate-pulse items-stretch gap-4 border-2 border-border bg-background p-2 shadow-hard">
									<div class="h-28 w-28 shrink-0 border-2 border-border bg-muted sm:h-32 sm:w-32" />
									<div class="flex flex-1 flex-col justify-between py-1">
										<div class="space-y-3">
											<div class="h-5 w-3/4 rounded bg-muted" />
											<div class="h-4 w-1/2 rounded bg-muted" />
										</div>
										<div class="flex items-end justify-between">
											<div class="h-6 w-1/3 rounded bg-muted" />
											<div class="h-10 w-10 rounded bg-muted" />
										</div>
									</div>
								</div>
							)}
						</For>
					</div>
				</Match>

				{/* Error State */}
				<Match when={query.isError}>
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<IconEmotionSad class="mb-3 h-10 w-10 text-amber-500" />
						<p class="font-bold text-muted-foreground/70">
							Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.
						</p>
						<button
							type="button"
							onClick={() => query.refetch()}
							class="mt-4 inline-flex h-11 min-w-[44px] items-center justify-center border-2 border-border bg-card px-5 font-bold text-xs uppercase shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none active:scale-95"
						>
							Дахин хайх
						</button>
					</div>
				</Match>

				{/* Empty State */}
				<Match
					when={
						query.data &&
						query.data.products.length === 0 &&
						!hasNavigationResults()
					}
				>
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<IconSearch class="mb-3 h-10 w-10 text-muted-foreground" />
						<p class="font-bold text-muted-foreground/70">
							"{props.searchQuery}" хайлтаар үр дүн олдсонгүй
						</p>
						<p class="mt-1 text-muted-foreground/80 text-sm">
							Өөр түлхүүр үгээр хайж үзнэ үү
						</p>
					</div>
				</Match>

				{/* Results */}
				<Match
					when={
						query.data &&
						(query.data.products.length > 0 || hasNavigationResults())
					}
				>
					<div>
						<Show when={hasNavigationResults()}>
							<div class="mb-4 space-y-3">
								<Show when={(query.data?.brands.length ?? 0) > 0}>
									<div>
										<p class="mb-2 font-bold text-[11px] text-muted-foreground/80 uppercase tracking-wide">
											Брэнд
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={query.data?.brands ?? []}>
												{(brand) => (
													<a
														href={`/products/brand/${brand.slug}/1/`}
														onClick={props.onProductClick}
														class="inline-flex min-h-10 items-center gap-2 border-2 border-border bg-primary px-3 py-2 font-black text-black text-xs shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
													>
														<IconStore class="h-4 w-4 shrink-0" />
														<span>{brand.name}</span>
														<Show when={brand.productCount !== undefined}>
															<span class="font-bold text-muted-foreground/55">
																{brand.productCount}
															</span>
														</Show>
													</a>
												)}
											</For>
										</div>
									</div>
								</Show>
								<Show when={(query.data?.categories.length ?? 0) > 0}>
									<div>
										<p class="mb-2 font-bold text-[11px] text-muted-foreground/80 uppercase tracking-wide">
											Ангилал
										</p>
										<div class="flex flex-wrap gap-2">
											<For each={query.data?.categories ?? []}>
												{(category) => (
													<a
														href={`/products/category/${category.slug}/1/`}
														onClick={props.onProductClick}
														class="inline-flex min-h-10 items-center gap-2 border-2 border-border bg-background px-3 py-2 font-black text-black text-xs shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:bg-primary/30 hover:shadow-none"
													>
														<IconFolder class="h-4 w-4 shrink-0" />
														<span>{category.name}</span>
														<Show when={category.productCount !== undefined}>
															<span class="font-bold text-muted-foreground/55">
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
						<Show when={(query.data?.products.length ?? 0) > 0}>
							<div class="mb-3 flex items-center justify-between px-1">
								<p class="font-bold text-muted-foreground/70 text-xs uppercase tracking-wide">
									{query.data?.products.length} бүтээгдэхүүн
								</p>
								<a
									href={`/products/?q=${encodeURIComponent(props.searchQuery)}`}
									class="flex items-center gap-1 font-black text-black text-xs uppercase tracking-wide transition-colors hover:text-foreground"
									onClick={props.onProductClick}
								>
									Бүгдийг үзэх <IconArrowRight class="h-3 w-3" />
								</a>
							</div>
						</Show>

						{/* Products List */}
						<div class="flex flex-col gap-3">
							<For each={query.data?.products ?? []}>
								{(product, index) => (
									<div class="group relative flex items-stretch gap-3 border-2 border-border bg-background p-2 shadow-hard transition-all hover:translate-x-px hover:translate-y-px hover:shadow-hard-sm">
										{/* Image */}
										<a
											href={`/products/${product.slug}-${product.id}/`}
											onClick={() =>
												handleProductClick(product.id, product.name, index())
											}
											class="relative h-28 w-28 shrink-0 overflow-hidden border-2 border-border sm:h-32 sm:w-32"
											style={`background: ${getProductColor(product.id)}`}
										>
											<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />
											<Show when={product.image}>
												<img
													src={
														toProductImageUrl(product.image, "sm") ||
														product.image
													}
													alt={product.name}
													class="absolute inset-0 h-full w-full object-contain p-2"
													loading="lazy"
												/>
											</Show>
										</a>

										{/* Content */}
										<div class="flex flex-1 flex-col justify-between py-1">
											<a
												href={`/products/${product.slug}-${product.id}/`}
												onClick={() =>
													handleProductClick(product.id, product.name, index())
												}
												class="flex flex-col gap-1.5"
											>
												<h3 class="line-clamp-2 font-black text-black text-sm leading-tight group-hover:underline sm:text-base">
													{product.name}
												</h3>
												<Show when={product.brand}>
													<span class="font-bold text-muted-foreground/80 text-xs uppercase tracking-wider">
														{product.brand}
													</span>
												</Show>
											</a>

											<div class="mt-3 flex items-end justify-between gap-2">
												<div>
													<div class="font-black text-lg tracking-tight sm:text-xl">
														{formatCurrency(product.price)}
													</div>
													<a
														href={`/products/${product.slug}-${product.id}/`}
														onClick={() =>
															handleProductClick(
																product.id,
																product.name,
																index(),
															)
														}
														class="mt-1 inline-flex min-h-8 items-center border-2 border-border bg-card px-2.5 font-black text-[10px] uppercase tracking-wider transition-colors hover:bg-primary"
													>
														Дэлгэрэнгүй
													</a>
												</div>
												<div class="origin-bottom-right">
													<AddToCartButton
														compact
														cartItem={{
															productId: product.id,
															quantity: 1,
															name: product.name,
															price: product.price,
															image: product.image || "",
															slug: product.slug,
														}}
													/>
												</div>
											</div>
										</div>
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
