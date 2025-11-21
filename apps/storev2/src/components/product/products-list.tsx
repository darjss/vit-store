import { useInfiniteQuery } from "@tanstack/solid-query";
import { formatCurrency } from "@vit/shared/utils";
import {
	createEffect,
	createMemo,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { productColors } from "@/lib/constant";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { useSearchParam } from "@/lib/useSearchParam";
import AddToCartButton from "../cart/add-to-cart-button";

const ProductsList = () => {
	const [cursor, setCursor] = useSearchParam("cursor", {
		defaultValue: undefined,
		skipTransition: true,
	});
	const query = useInfiniteQuery(
		() => ({
			queryKey: ["products"],
			queryFn: async ({ pageParam }) => {
				return await api.product.getInfiniteProducts.query({
					cursor: pageParam ?? cursor() ?? undefined,
					limit: 10,
				});
			},
			initialPageParam: (cursor() ?? undefined) as string | undefined,
			getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		}),
		() => queryClient,
	);

	// Flatten all pages into a single array for easier rendering
	const allProducts = createMemo(() => {
		if (!query.data) return [];
		return query.data.pages.flatMap((page) => page.items);
	});

	// Track scroll position for restoration
	let scrollRestored = false;

	// Store scroll position when user scrolls (for restoration on back/forward)
	onMount(() => {
		if (typeof window === "undefined") return;

		let scrollTimeout: number | undefined;
		const handleScroll = () => {
			if (scrollTimeout) clearTimeout(scrollTimeout);
			scrollTimeout = window.setTimeout(() => {
				const urlCursor = cursor();
				if (urlCursor) {
					sessionStorage.setItem(
						`products-scroll-${urlCursor}`,
						window.scrollY.toString(),
					);
				}
			}, 150);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });

		onCleanup(() => {
			window.removeEventListener("scroll", handleScroll);
			if (scrollTimeout) clearTimeout(scrollTimeout);
		});
	});

	// Restore scroll position when page loads with cursor
	createEffect(() => {
		if (typeof window === "undefined") return;
		if (scrollRestored) return;
		if (!query.data || allProducts().length === 0) return;

		const urlCursor = cursor();
		if (!urlCursor) return;

		const savedScroll = sessionStorage.getItem(`products-scroll-${urlCursor}`);
		if (savedScroll) {
			// Small delay to ensure DOM is fully rendered
			setTimeout(() => {
				window.scrollTo({
					top: Number.parseInt(savedScroll, 10),
					behavior: "auto",
				});
				scrollRestored = true;
			}, 100);
		}
	});

	// Sync cursor search param with the latest nextCursor for scroll restoration
	createEffect(() => {
		if (!query.data) return;
		const pages = query.data.pages;
		if (pages.length === 0) return;

		// Get the nextCursor from the last page
		const lastPage = pages[pages.length - 1];
		const nextCursor = lastPage.nextCursor ?? undefined;

		// Only update if the cursor has changed to avoid unnecessary updates
		const currentCursor = cursor();
		if (currentCursor !== nextCursor) {
			setCursor(nextCursor ?? null);
		}
	});

	// Set up Intersection Observer for infinite scroll
	// Callback ref pattern ensures observer is set up when element is mounted
	const setupObserver = (element: HTMLDivElement) => {
		// Create observer with rootMargin to trigger before reaching the bottom
		// This ensures content loads before user sees the bottom
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				// When sentinel is visible and we have more pages, fetch next page
				if (
					entry.isIntersecting &&
					query.hasNextPage &&
					!query.isFetchingNextPage &&
					!query.isLoading
				) {
					query.fetchNextPage();
				}
			},
			{
				// Trigger when sentinel is 200px before entering viewport
				// Adjust this value to control how early loading starts
				rootMargin: "200px",
				threshold: 0.1,
			},
		);

		observer.observe(element);

		// Cleanup observer when element is unmounted
		onCleanup(() => {
			observer.unobserve(element);
			observer.disconnect();
		});
	};

	// const [brandId, setBrandId] = useSearchParam("brandId", { defaultValue: undefined });
	// const [categoryId, setCategoryId] = useSearchParam("categoryId", { defaultValue: undefined });
	// const [sortField, setSortField] = useSearchParam("sortField", { defaultValue: undefined });
	// const [sortDirection, setSortDirection] = useSearchParam("sortDirection", { defaultValue: undefined });
	// const [searchTerm, setSearchTerm] = useSearchParam("searchTerm", { defaultValue: undefined });

	return (
		<div
			class="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8"
			style="scroll-behavior: smooth;"
		>
			<div class="rounded-xl border-4 border-black bg-primary/5 px-3 py-4 shadow-[8px_8px_0_0_#000] sm:rounded-2xl sm:px-6 sm:py-6 sm:shadow-[10px_10px_0_0_#000]">
				{/* Header */}
				<div class="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
					<div>
						<div class="mb-2 inline-flex items-center gap-2 rounded-sm border-2 border-black bg-white px-2.5 py-1 font-black text-[10px] uppercase tracking-[0.18em] shadow-[3px_3px_0_0_#000] sm:text-xs">
							<span>🛒</span>
							<span>Product catalog</span>
						</div>
						<h1 class="mb-1.5 font-black text-2xl tracking-tight sm:mb-2 sm:text-4xl">
							All Products
						</h1>
						<p class="text-black/70 text-sm sm:text-base">
							Browse our complete collection of products
						</p>
					</div>
				</div>

				{/* Products Grid / Initial Loading State */}
				<Show
					when={query.data && allProducts().length > 0}
					fallback={
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
							<For each={Array(8)}>
								{() => (
									<div class="flex animate-pulse flex-col rounded-md border-2 border-black bg-white shadow-[3px_3px_0_0_#000] sm:border-3 sm:shadow-[6px_6px_0_0_#000]">
										<div class="relative aspect-4/5 overflow-hidden border-black border-b-2 bg-gray-100 sm:aspect-4/3 sm:border-b-3">
											<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px] opacity-40" />
											<div class="absolute right-2 bottom-2 h-4 w-16 rounded-full border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:right-3 sm:bottom-3" />
										</div>
										<div class="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
											<div class="h-3 w-20 rounded bg-gray-200" />
											<div class="h-3 w-4/5 rounded bg-gray-200" />
											<div class="h-3 w-2/3 rounded bg-gray-200" />
										</div>
										<div class="border-black border-t-2 bg-primary/5 px-2.5 py-2 sm:border-t-3 sm:px-3 sm:py-2.5">
											<div class="h-4 w-1/2 rounded bg-gray-200" />
										</div>
									</div>
								)}
							</For>
						</div>
					}
				>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
						<For each={allProducts()}>
							{(product) => {
								// Use product ID to get consistent color per product
								const randomColor = createMemo(
									() => productColors[product.id % productColors.length],
								);
								const productImage = createMemo(() => product.images?.[0]?.url);
								const productUrl = `/products/${product.slug}-${product.id}`;

								// Type-safe brand access (brand may not be present in paginated results)
								const brandName = createMemo(() => {
									const productWithBrand = product as typeof product & {
										brand?: { name: string };
									};
									return productWithBrand.brand?.name;
								});

								return (
									<div
										class="group relative flex flex-col rounded-md border-2 border-black bg-white shadow-[3px_3px_0_0_#000] transition-transform duration-200 hover:translate-x-px hover:translate-y-px hover:shadow-[1px_1px_0_0_#000] sm:rounded-lg sm:border-3 sm:shadow-[6px_6px_0_0_#000] sm:hover:translate-x-[3px] sm:hover:translate-y-[3px] sm:hover:shadow-[3px_3px_0_0_#000]"
										data-product-id={product.id}
									>
										<a
											href={productUrl}
											class="flex flex-1 flex-col focus:outline-none focus:ring-4 focus:ring-black/40"
											aria-label={`${product.name}${brandName() ? ` by ${brandName()}` : ""}`}
										>
											{/* Image Section */}
											<div
												class="relative aspect-4/5 overflow-hidden border-black border-b-2 sm:aspect-4/3 sm:border-b-3"
												style={`background:${randomColor()}`}
											>
												<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />
												<Show when={productImage()}>
													{(img) => (
														<img
															src={img()}
															alt={product.name}
															class="absolute inset-0 h-full w-full object-contain p-3 sm:p-4"
															width={400}
															height={500}
															loading="lazy"
														/>
													)}
												</Show>

												<Show when={brandName()}>
													<div class="absolute right-2 bottom-2 rounded-full border-2 border-black bg-white px-2 py-0.5 font-black text-[9px] uppercase tracking-tight shadow-[2px_2px_0_0_#000] sm:right-3 sm:bottom-3 sm:px-3 sm:py-1 sm:text-[10px]">
														{brandName()}
													</div>
												</Show>
											</div>

											{/* Content Section */}
											<div class="flex flex-1 flex-col gap-1.5 p-2.5 sm:p-3">
												<h3 class="line-clamp-3 font-black text-xs leading-snug tracking-tight group-hover:underline sm:text-sm sm:leading-tight">
													{product.name}
												</h3>
											</div>
										</a>

										{/* Price & CTA bar */}
										<div class="flex items-center justify-between gap-2 border-black border-t-2 bg-primary/5 px-2.5 py-2 sm:border-t-3 sm:px-3 sm:py-2.5">
											<div class="font-black text-base tracking-tight sm:text-xl">
												{formatCurrency(product.price)}
											</div>
											<AddToCartButton
												compact
												cartItem={{
													productId: product.id,
													quantity: 1,
													name: product.name,
													price: product.price,
													image: productImage() || "",
												}}
											/>
										</div>
									</div>
								);
							}}
						</For>
					</div>
				</Show>

				{/* Empty State */}
				<Show when={query.data && allProducts().length === 0}>
					<div class="py-12 text-center">
						<p class="text-black/70 text-lg">No products found.</p>
					</div>
				</Show>

				{/* Error State */}
				<Show when={query.isError}>
					<div class="py-12 text-center">
						<p class="text-destructive text-lg">
							Error loading products. Please try again.
						</p>
					</div>
				</Show>

				{/* Loading Skeleton for Pagination */}
				<Show when={query.isFetchingNextPage}>
					<div class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
						<For each={Array(4)}>
							{() => (
								<div class="flex animate-pulse flex-col rounded-md border-2 border-black bg-white shadow-[3px_3px_0_0_#000] sm:border-3 sm:shadow-[6px_6px_0_0_#000]">
									<div class="relative aspect-4/5 overflow-hidden border-black border-b-2 bg-gray-100 sm:aspect-4/3 sm:border-b-3">
										<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px] opacity-40" />
										<div class="absolute right-2 bottom-2 h-4 w-16 rounded-full border-2 border-black bg-gray-200 shadow-[2px_2px_0_0_#000] sm:right-3 sm:bottom-3" />
									</div>
									<div class="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
										<div class="h-3 w-20 rounded bg-gray-200" />
										<div class="h-3 w-4/5 rounded bg-gray-200" />
										<div class="h-3 w-2/3 rounded bg-gray-200" />
									</div>
									<div class="border-black border-t-2 bg-primary/5 px-2.5 py-2 sm:border-t-3 sm:px-3 sm:py-2.5">
										<div class="h-4 w-1/2 rounded bg-gray-200" />
									</div>
								</div>
							)}
						</For>
					</div>
				</Show>

				{/* Loading Indicator for Next Page */}
				<Show when={query.isFetchingNextPage && !query.data}>
					<div class="mt-6 flex items-center justify-center py-8">
						<div class="flex flex-col items-center gap-3">
							<div class="h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
							<p class="text-black/70 text-sm">Loading more products...</p>
						</div>
					</div>
				</Show>

				{/* End of List Message */}
				<Show
					when={query.data && !query.hasNextPage && allProducts().length > 0}
				>
					<div class="mt-8 py-8 text-center">
						<div class="inline-flex items-center gap-2 rounded-full border-2 border-black bg-white px-4 py-2 shadow-[3px_3px_0_0_#000]">
							<span class="text-lg">✨</span>
							<p class="font-black text-sm uppercase tracking-wide">
								You've reached the end
							</p>
						</div>
						<p class="mt-3 text-black/70 text-sm">
							Showing all {allProducts().length} products
						</p>
					</div>
				</Show>

				{/* Infinite Scroll Sentinel - invisible element that triggers loading */}
				<Show
					when={query.hasNextPage && query.data && !query.isFetchingNextPage}
				>
					<div ref={setupObserver} class="h-1 w-full" aria-hidden="true" />
				</Show>
			</div>
		</div>
	);
};

export default ProductsList;
