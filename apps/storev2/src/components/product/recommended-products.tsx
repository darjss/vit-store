import type { ProductForHome } from "@vit/shared/types";
import { createResource, For, Show } from "solid-js";
import { api } from "@/lib/trpc";
import ProductCard from "./product-card";

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

async function fetchRecommendedProducts(
	productId: number,
	categoryId: number,
	brandId: number,
): Promise<ProductForHome[]> {
	try {
		return await withTimeout(
			api.product.getRecommendedProducts.query({
				productId,
				categoryId,
				brandId,
			}),
			RECOMMENDED_FETCH_TIMEOUT_MS,
		);
	} catch {
		try {
			const fallbackProducts = await withTimeout(
				api.product.getProductsForHome.query(),
				RECOMMENDED_FETCH_TIMEOUT_MS,
			);
			return fallbackProducts.featuredProducts
				.filter(
					(product) => product.id !== productId && (product.stock ?? 0) > 0,
				)
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

	return (
		<section class="w-full py-6 sm:py-10">
			<Show when={!products.loading && products()} keyed>
				{(list) => (
					<Show when={list.length > 0}>
						<ShelfHeading />
						<div class="scrollbar-hide -mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
							<For each={list}>
								{(product) => (
									<div class="w-[160px] shrink-0 snap-start sm:w-[200px] lg:w-[220px]">
										<ProductCard product={product} />
									</div>
								)}
							</For>
						</div>
					</Show>
				)}
			</Show>

			<Show when={products.loading}>
				<ShelfHeading />
				<div class="scrollbar-hide -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
					<For each={Array(4)}>
						{() => (
							<div class="w-[160px] shrink-0 sm:w-[200px] lg:w-[220px]">
								<div class="animate-pulse overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
									<div class="aspect-4/5 bg-muted/40" />
									<div class="space-y-2 p-3">
										<div class="h-3 w-1/3 rounded bg-muted/60" />
										<div class="h-4 w-3/4 rounded bg-muted/60" />
										<div class="h-4 w-1/2 rounded bg-muted/60" />
									</div>
								</div>
							</div>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
