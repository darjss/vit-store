import { useQuery } from "@tanstack/solid-query";
import { formatCurrency } from "@vit/shared/utils";
import type { Component } from "solid-js";
import { createEffect, For, Match, Show, Switch } from "solid-js";
import AddToCartButton from "@/components/cart/add-to-cart-button";
import {
	trackSearchPerformed,
	trackSearchResultClicked,
} from "@/lib/analytics";
import { productColors } from "@/lib/constant";
import { toProductImageUrl } from "@/lib/image";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconArrowRight from "~icons/ri/arrow-right-line";
import IconEmotionSad from "~icons/ri/emotion-sad-line";
import IconSearch from "~icons/ri/search-line";

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
					return [];
				}
				return await api.product.searchProducts.query({
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
			trackSearchPerformed(props.searchQuery, query.data.length);
		}
	});

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
								<div class="flex animate-pulse items-stretch gap-4 rounded-md border-2 border-black bg-white p-2 shadow-[3px_3px_0_0_#000]">
									<div class="h-28 w-28 shrink-0 rounded-sm border-2 border-black bg-gray-100 sm:h-32 sm:w-32" />
									<div class="flex flex-1 flex-col justify-between py-1">
										<div class="space-y-3">
											<div class="h-5 w-3/4 rounded bg-gray-200" />
											<div class="h-4 w-1/2 rounded bg-gray-200" />
										</div>
										<div class="flex items-end justify-between">
											<div class="h-6 w-1/3 rounded bg-gray-200" />
											<div class="h-10 w-10 rounded bg-gray-200" />
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
						<p class="font-bold text-black/70">
							Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.
						</p>
					</div>
				</Match>

				{/* Empty State */}
				<Match when={query.data && query.data.length === 0}>
					<div class="flex flex-col items-center justify-center py-8 text-center">
						<IconSearch class="mb-3 h-10 w-10 text-gray-400" />
						<p class="font-bold text-black/70">
							"{props.searchQuery}" хайлтаар үр дүн олдсонгүй
						</p>
						<p class="mt-1 text-black/50 text-sm">
							Өөр түлхүүр үгээр хайж үзнэ үү
						</p>
					</div>
				</Match>

				{/* Results */}
				<Match when={query.data && query.data.length > 0}>
					<div>
						{/* Results Header */}
						<div class="mb-3 flex items-center justify-between px-1">
							<p class="font-bold text-black/70 text-xs uppercase tracking-wide">
								{query.data?.length} үр дүн
							</p>
							<a
								href={`/products?q=${encodeURIComponent(props.searchQuery)}`}
								class="flex items-center gap-1 font-black text-black text-xs uppercase tracking-wide transition-colors hover:text-primary"
								onClick={props.onProductClick}
							>
								Бүгдийг үзэх <IconArrowRight class="h-3 w-3" />
							</a>
						</div>

						{/* Products List */}
						<div class="flex flex-col gap-3">
							<For each={query.data}>
								{(product, index) => (
									<div class="group relative flex items-stretch gap-3 rounded-md border-2 border-black bg-white p-2 shadow-[3px_3px_0_0_#000] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_#000]">
										{/* Image */}
										<a
											href={`/products/${product.slug}-${product.id}`}
											onClick={() =>
												handleProductClick(product.id, product.name, index())
											}
											class="relative h-28 w-28 shrink-0 overflow-hidden rounded-sm border-2 border-black sm:h-32 sm:w-32"
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
												href={`/products/${product.slug}-${product.id}`}
												onClick={() =>
													handleProductClick(product.id, product.name, index())
												}
												class="flex flex-col gap-1.5"
											>
												<h3 class="line-clamp-3 font-bold text-base text-black leading-snug group-hover:underline sm:text-lg">
													{product.name}
												</h3>
												<Show when={product.brand}>
													<span class="font-bold text-black/50 text-xs uppercase tracking-wider">
														{product.brand}
													</span>
												</Show>
											</a>

											<div class="mt-3 flex items-end justify-between gap-2">
												<div class="font-black text-lg tracking-tight sm:text-xl">
													{formatCurrency(product.price)}
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
