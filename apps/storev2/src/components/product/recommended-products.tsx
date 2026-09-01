import type { ProductForHome } from "@vit/shared/types";
import { createResource, For, Show } from "solid-js";
import { api } from "@/lib/trpc";
import ProductCard from "./product-card";

interface RecommendedProductsProps {
	brandId: number;
	categoryId: number;
	currentProductId: number;
	washKey?: string | number;
}

const RECOMMENDED_FETCH_TIMEOUT_MS = 6000;
const RECOMMENDED_SHELF_LIMIT = 6;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(() => reject(new Error(`recommended products timed out after ${ms}ms`)), ms),
		),
	]);

async function fetchRecommendedProducts(
	productId: number,
	categoryId: number,
	brandId: number,
): Promise<Array<ProductForHome>> {
	try {
		return await withTimeout(
			api.product.getRecommendedProducts.query({
				brandId,
				categoryId,
				productId,
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
				.filter((product) => product.id !== productId && (product.stock ?? 0) > 0)
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
			<p class="text-muted-foreground mt-1 text-sm sm:text-base">
				Таны сонголтод тулгуурлан санал болгож байна
			</p>
		</div>
	);
}

export default function RecommendedProducts(props: RecommendedProductsProps) {
	const [products] = createResource(
		() => ({
			brandId: props.brandId,
			categoryId: props.categoryId,
			productId: props.currentProductId,
		}),
		(params) => fetchRecommendedProducts(params.productId, params.categoryId, params.brandId),
	);

	return (
		<section class="w-full py-6 sm:py-10">
			<Show keyed when={!products.loading && products()}>
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
								<div class="border-border bg-card shadow-soft animate-pulse overflow-hidden rounded-2xl border">
									<div class="bg-muted/40 aspect-4/5" />
									<div class="space-y-2 p-3">
										<div class="bg-muted/60 h-3 w-1/3 rounded" />
										<div class="bg-muted/60 h-4 w-3/4 rounded" />
										<div class="bg-muted/60 h-4 w-1/2 rounded" />
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
