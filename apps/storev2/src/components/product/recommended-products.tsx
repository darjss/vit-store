import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import { productStockState } from "@vit/shared/domain/product";
import type { ProductForHome } from "@vit/shared/types";
import { createResource, createSignal, For, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import { washBg } from "@/lib/wash";
import CardAddButton from "./card-add-button";
import ProductImageFallback from "./product-image-fallback";

interface RecommendedProductsProps {
	currentProductId: number;
	categoryId: number;
	brandId: number;
	washKey?: string | number;
}

const RECOMMENDED_FETCH_TIMEOUT_MS = 6000;
const RECOMMENDED_SHELF_LIMIT = 6;

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

function isInStock(stock?: number) {
	return productStockState(stock) !== "out";
}

async function fetchRecommendedProducts(
	productId: number,
	categoryId: number,
	brandId: number,
): Promise<ProductForHome[]> {
	try {
		const products = await withTimeout(
			api.product.getRecommendedProducts.query({
				productId,
				categoryId,
				brandId,
			}),
			RECOMMENDED_FETCH_TIMEOUT_MS,
		);
		return products.map((p) => ({
			id: p.id,
			slug: p.slug,
			name: p.name,
			price: p.price,
			image: p.image,
			brand: p.brand,
			stock: p.stock,
		}));
	} catch {
		try {
			const fallbackProducts = await withTimeout(
				api.product.getProductsForHome.query(),
				RECOMMENDED_FETCH_TIMEOUT_MS,
			);
			return fallbackProducts.featuredProducts
				.filter((p) => p.id !== productId && isInStock(p.stock))
				.slice(0, RECOMMENDED_SHELF_LIMIT);
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
		}),
		(params) =>
			fetchRecommendedProducts(
				params.productId,
				params.categoryId,
				params.brandId,
			),
	);

	const washClass = () => washBg(props.washKey ?? props.categoryId);

	return (
		<section class="w-full py-6 sm:py-10">
			<Show when={!products.loading && products()} keyed>
				{(list) => (
					<Show when={list.length > 0}>
						<ShelfHeading />

						<div class="scrollbar-hide -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
							<For each={list}>
								{(product) => {
									const imageProps = getProductImageProps(
										product.image,
										"card",
									);
									const [imageFailed, setImageFailed] = createSignal(false);
									const productUrl = `/products/${product.slug}-${product.id}/`;
									const stockState = () => productStockState(product.stock);
									const isLowStock = () => stockState() === "low";

									return (
										<div
											data-shelf-card
											class="group hover:-translate-y-1 enter-rise flex w-[144px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-card shadow-soft transition-[transform,box-shadow] duration-200 ease-out-quart hover:shadow-soft-lg sm:w-[200px] lg:w-[220px]"
										>
											<a
												href={productUrl}
												class="relative block aspect-square overflow-hidden"
												aria-hidden="true"
												tabIndex={-1}
											>
												<div class={`absolute inset-0 ${washClass()}`}>
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
													<Show when={isLowStock()}>
														<span class="absolute bottom-2 left-2 z-20 inline-flex items-center rounded-full border border-border bg-card px-2 py-0.5 font-semibold text-[10px] text-foreground">
															Цөөн үлдсэн
														</span>
													</Show>
												</div>
											</a>

											<div class="flex flex-1 flex-col gap-1.5 p-3 sm:p-4">
												<span class="font-medium text-[11px] text-muted-foreground">
													{product.brand}
												</span>
												<a href={productUrl} class="block">
													<h3 class="line-clamp-2 min-h-[2.5em] font-medium text-sm leading-snug group-hover:underline">
														{product.name}
													</h3>
												</a>
												<div class="mt-auto flex items-end justify-between gap-2 pt-1">
													<span class="font-display text-base">
														{formatCurrency(product.price)}
													</span>
													<CardAddButton
														requireVerifiedInventory
														cartItem={{
															productId: product.id,
															quantity: 1,
															name: product.name,
															price: product.price,
															image: product.image,
															slug: product.slug,
														}}
													/>
												</div>
											</div>
										</div>
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
