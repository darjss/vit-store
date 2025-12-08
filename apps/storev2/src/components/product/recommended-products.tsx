import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared/utils";
import { createResource, For, Show } from "solid-js";
import { productColors } from "@/lib/constant";
import { api } from "@/lib/trpc";
import type { ProductForHome } from "@/lib/types";

interface RecommendedProductsProps {
	currentProductId: number;
	categoryId: number;
	brandId: number;
}

async function fetchRecommendedProducts(
	productId: number,
	categoryId: number,
	brandId: number,
): Promise<ProductForHome[]> {
	try {
		// Use tRPC API client
		const products = await api.product.getRecommendedProducts.query({
			productId,
			categoryId,
			brandId,
		});
		return products;
	} catch (error) {
		console.error("Error fetching recommended products:", error);
		// Fallback: fetch featured products
		try {
			const fallbackProducts = await api.product.getProductsForHome.query();
			return fallbackProducts.featuredProducts.slice(0, 4);
		} catch (fallbackError) {
			console.error("Error fetching fallback products:", fallbackError);
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
		}),
		(params) =>
			fetchRecommendedProducts(
				params.productId,
				params.categoryId,
				params.brandId,
			),
	);
	console.log("products", products());
	return (
		<section class="w-full py-8 sm:py-12">
			<div class="mb-8 sm:mb-10">
				<h2 class="mb-2 font-black text-2xl uppercase tracking-tight sm:mb-3 sm:text-3xl md:text-4xl">
					💡 Таньд таалагдаж магадгүй
				</h2>
				<p class="font-bold text-muted-foreground text-sm uppercase tracking-wide sm:text-base">
					Таны сонголтод тулгуурлан санал болгож байна
				</p>
			</div>

			<Show
				when={!products.loading && products()}
				fallback={
					<div class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
						{Array(4)
							.fill(0)
							.map((_, _i) => (
								<div class="h-[300px] animate-pulse border-2 border-border bg-muted/30 shadow-hard sm:h-[400px]" />
							))}
					</div>
				}
			>
				<div class="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
					<For each={products()}>
						{(product) => {
							const _randomColor =
								productColors[Math.floor(Math.random() * productColors.length)];
							const hasDiscount = product.discount && product.discount > 0;
							const originalPrice = product.price;
							const discountedPrice = hasDiscount
								? product.price * (1 - (product.discount || 0) / 100)
								: product.price;

							return (
								<a
									href={`/products/${product.slug}-${product.id}`}
									class="group hover:-translate-y-1 relative block border-2 border-border bg-card shadow-hard transition-all hover:shadow-hard-lg"
								>
									{/* Image Section */}
									<div
										class="relative aspect-[4/5] overflow-hidden border-border border-b-2 bg-muted/20"
									>
										<div class="absolute inset-0 bg-dots-pattern opacity-30" />
										
										{/* Brand Badge */}
										<div class="absolute top-3 left-3 z-10">
											<span class="border-2 border-border bg-background px-2 py-1 font-bold text-[10px] uppercase shadow-hard-sm sm:text-xs">
												{product.brand}
											</span>
										</div>

										<Show when={product.image}>
											<Image
												src={product.image}
												alt={product.name}
												width={300}
												height={375}
												layout="constrained"
												class="relative z-10 h-full w-full object-contain p-6 drop-shadow-md transition-transform duration-500 group-hover:scale-110"
												loading="lazy"
											/>
										</Show>

										{/* Discount Badge */}
										<Show when={hasDiscount}>
											<div class="absolute top-3 right-3 z-10 border-2 border-border bg-destructive px-2 py-1 font-black text-[10px] text-destructive-foreground shadow-hard-sm sm:text-xs">
												-{product.discount}%
											</div>
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
											<Show when={hasDiscount}>
												<span class="font-bold text-muted-foreground text-xs line-through decoration-2 decoration-destructive">
													{formatCurrency(originalPrice)}
												</span>
											</Show>
											<span class="font-black text-lg tracking-tight sm:text-xl">
												{formatCurrency(discountedPrice)}
											</span>
										</div>
									</div>
								</a>
							);
						}}
					</For>
				</div>
			</Show>
		</section>
	);
}
