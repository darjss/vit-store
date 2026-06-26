import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import type { ProductForHome } from "@vit/shared/types";
import { createResource, For, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import IconLightbulb from "~icons/ri/lightbulb-flash-fill";

interface RecommendedProductsProps {
	currentProductId: number;
	categoryId: number;
	brandId: number;
	productName: string;
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

		// Only use search results if we have enough for a decent grid (>=3).
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
	return (
		<section class="w-full py-8 sm:py-12">
			<Show when={!products.loading && products()} keyed>
				{(list) => (
					<Show when={list.length > 0}>
						<div class="mb-8 sm:mb-10">
							<h2 class="mb-2 flex items-center gap-2 font-black text-2xl uppercase tracking-tight sm:mb-3 sm:text-3xl md:text-4xl">
								<IconLightbulb class="text-yellow-500" /> Таньд таалагдаж магадгүй
							</h2>
							<p class="font-bold text-muted-foreground text-sm uppercase tracking-wide sm:text-base">
								Таны сонголтод тулгуурлан санал болгож байна
							</p>
						</div>

						<div class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
							<For each={list}>
								{(product) => {
									const imageProps = getProductImageProps(product.image, "card");

									return (
										<a
											href={`/products/${product.slug}-${product.id}/`}
											class="group hover:-translate-y-1 relative block border-2 border-border bg-card shadow-hard transition-all hover:shadow-hard-lg"
										>
											{/* Image Section */}
											<div class="relative aspect-[4/5] overflow-hidden border-border border-b-2 bg-muted/20">
												<div class="absolute inset-0 bg-dots-pattern opacity-30" />

												{/* Brand Badge */}
												<div class="absolute top-3 left-3 z-10">
													<span class="border-2 border-border bg-background px-2 py-1 font-bold text-[10px] uppercase shadow-hard-sm sm:text-xs">
														{product.brand}
													</span>
												</div>

												<Show when={product.image}>
													<Image
														src={imageProps.src || product.image}
														alt={product.name}
														width={imageProps.width}
														height={imageProps.height}
														sizes={imageProps.sizes}
														layout="constrained"
														objectFit="contain"
														class="relative z-10 h-full w-full p-6 drop-shadow-md transition-transform duration-500 group-hover:scale-110"
														loading="lazy"
														decoding="async"
													/>
												</Show>

											</div>

											{/* Content Section */}
											<div class="flex flex-col gap-3 p-4">
												{/* Product Name */}
												<h3 class="line-clamp-2 min-h-[2.5em] font-bold text-sm leading-tight transition-colors group-hover:text-primary sm:text-base">
													{product.name}
												</h3>

												{/* Price Section */}
												<div class="mt-auto flex flex-col">
													<span class="font-black text-lg tracking-tight sm:text-xl">
														{formatCurrency(product.price)}
													</span>
												</div>
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
				<div class="mb-8 sm:mb-10">
					<h2 class="mb-2 flex items-center gap-2 font-black text-2xl uppercase tracking-tight sm:mb-3 sm:text-3xl md:text-4xl">
						<IconLightbulb class="text-yellow-500" /> Таньд таалагдаж магадгүй
					</h2>
					<p class="font-bold text-muted-foreground text-sm uppercase tracking-wide sm:text-base">
						Таны сонголтод тулгуурлан санал болгож байна
					</p>
				</div>
				<div class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
					{Array(4)
						.fill(0)
						.map((_v, _i) => (
							<div class="h-[300px] animate-pulse border-2 border-border bg-muted/30 shadow-hard sm:h-[400px]" />
						))}
				</div>
			</Show>
		</section>
	);
}
