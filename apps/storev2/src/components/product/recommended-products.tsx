import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import type { ProductForHome } from "@vit/shared/types";
import { animate, inView, stagger } from "motion";
import { createResource, createSignal, For, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import { WASH_BG, washFor } from "@/lib/wash";
import ProductImageFallback from "./product-image-fallback";

interface RecommendedProductsProps {
	currentProductId: number;
	categoryId: number;
	brandId: number;
	productName: string;
	washKey?: string | number;
}

const RECOMMENDED_FETCH_TIMEOUT_MS = 6000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(
				() => reject(new Error(`recommended products timed out after ${ms}ms`)),
				ms,
			),
		),
	]);

async function fetchRecommendedProducts(
	productId: number,
	categoryId: number,
	brandId: number,
	productName: string,
): Promise<ProductForHome[]> {
	try {
		const upstashMatches = await withTimeout(
			api.product.searchProductsForPageWithStock.query({
				query: productName,
				limit: 10,
				categoryId,
				brandId,
			}),
			RECOMMENDED_FETCH_TIMEOUT_MS,
		);
		const filteredMatches = upstashMatches
			.filter((p) => p.id !== productId && p.slug)
			.slice(0, 5)
			.map((p) => ({
				id: p.id,
				slug: p.slug,
				name: p.name,
				price: p.price,
				image: p.image,
				brand: p.brand,
			}));

		// Only use search results if we have enough for a decent shelf (>=3).
		// Otherwise fall back to category/brand-based recommendations.
		if (filteredMatches.length >= 3) {
			return filteredMatches;
		}

		const products = await withTimeout(
			api.product.getRecommendedProducts.query({
				productId,
				categoryId,
				brandId,
			}),
			RECOMMENDED_FETCH_TIMEOUT_MS,
		);
		// Merge search matches with recommended, dedupe by id, cap at 4
		const seen = new Set(filteredMatches.map((p) => p.id));
		const merged = [
			...filteredMatches,
			...products.filter((p) => !seen.has(p.id) && p.slug),
		].slice(0, 4);
		return merged;
	} catch {
		try {
			const fallbackProducts = await withTimeout(
				api.product.getProductsForHomeWithStock.query(),
				RECOMMENDED_FETCH_TIMEOUT_MS,
			);
			return fallbackProducts.featuredProducts.slice(0, 4);
		} catch {
			return [];
		}
	}
}

function ShelfHeading() {
	return (
		<div class="mb-5 sm:mb-6">
			<h2 class="font-display text-h3 sm:text-h2">Таньд таалагдаж магадгүй</h2>
			<p class="mt-1 text-muted-foreground text-sm sm:text-base">
				Таны сонголтод тулгуурлан санал болгож байна
			</p>
		</div>
	);
}

export default function RecommendedProducts(props: RecommendedProductsProps) {
	const [products] = createResource(
		() => ({
			productId: props.currentProductId,
			categoryId: props.categoryId,
			brandId: props.brandId,
			productName: props.productName,
		}),
		(params) =>
			fetchRecommendedProducts(
				params.productId,
				params.categoryId,
				params.brandId,
				params.productName,
			),
	);

	const washClass = () => WASH_BG[washFor(props.washKey ?? props.categoryId)];

	const setupReveal = (el: HTMLElement) => {
		queueMicrotask(() => {
			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
			const cards = Array.from(
				el.querySelectorAll<HTMLElement>("[data-shelf-card]"),
			);
			if (cards.length === 0) return;
			for (const card of cards) {
				card.style.opacity = "0";
				card.style.transform = "translateY(12px)";
			}
			inView(
				el,
				() => {
					animate(
						cards,
						{ opacity: 1, transform: "translateY(0px)" },
						{
							duration: 0.35,
							delay: stagger(0.04),
							ease: [0.23, 1, 0.32, 1],
						},
					);
				},
				{ amount: 0.15 },
			);
		});
	};

	return (
		<section class="w-full py-6 sm:py-10">
			<Show when={!products.loading && products()} keyed>
				{(list) => (
					<Show when={list.length > 0}>
						<ShelfHeading />

						<div
							ref={setupReveal}
							class="scrollbar-hide -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:gap-4 sm:px-0"
						>
							<For each={list}>
								{(product) => {
									const imageProps = getProductImageProps(
										product.image,
										"card",
									);
									const [imageFailed, setImageFailed] =
										createSignal(false);

									return (
										<a
											href={`/products/${product.slug}-${product.id}/`}
											data-shelf-card
											class="group hover:-translate-y-1 block w-[144px] shrink-0 snap-start overflow-hidden rounded-2xl bg-card shadow-soft transition-[transform,box-shadow] duration-200 ease-out-quart hover:shadow-soft-lg sm:w-[200px] lg:w-[220px]"
										>
											<div
												class={`relative aspect-square overflow-hidden ${washClass()}`}
											>
												<div class="absolute inset-0 bg-dots-subtle" />
												<Show
													when={product.image && !imageFailed()}
													fallback={
														<ProductImageFallback
															name={product.name}
															brand={product.brand}
														/>
													}
												>
													<Image
														src={imageProps.src || product.image}
														alt={product.name}
														width={imageProps.width}
														height={imageProps.height}
														sizes={imageProps.sizes}
														layout="constrained"
														objectFit="contain"
														class="relative z-10 h-full w-full p-4 transition-transform duration-300 ease-out-quart group-hover:scale-[1.04]"
														loading="lazy"
														decoding="async"
														onError={() => setImageFailed(true)}
													/>
												</Show>
											</div>

											<div class="flex flex-col gap-1.5 p-3 sm:p-4">
												<span class="font-medium text-[11px] text-muted-foreground">
													{product.brand}
												</span>
												<h3 class="line-clamp-2 min-h-[2.5em] font-medium text-sm leading-snug">
													{product.name}
												</h3>
												<span class="font-display text-base">
													{formatCurrency(product.price)}
												</span>
											</div>
										</a>
									);
								}}
							</For>
						</div>
					</Show>
				)}
			</Show>

			<Show when={products.loading}>
				<ShelfHeading />
				<div class="scrollbar-hide -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
					{Array(4)
						.fill(0)
						.map(() => (
							<div class="w-[144px] shrink-0 sm:w-[200px] lg:w-[220px]">
								<div class="animate-pulse overflow-hidden rounded-2xl bg-card shadow-soft">
									<div class="aspect-square bg-muted/40" />
									<div class="space-y-2 p-3 sm:p-4">
										<div class="h-3 w-1/3 rounded bg-muted/60" />
										<div class="h-4 w-3/4 rounded bg-muted/60" />
										<div class="h-4 w-1/2 rounded bg-muted/60" />
									</div>
								</div>
							</div>
						))}
				</div>
			</Show>
		</section>
	);
}
