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
		<section class="w-full py-6 sm:py-12">
			<div class="mb-6 sm:mb-8">
				<h2 class="mb-1.5 font-black text-2xl tracking-tight sm:mb-2 sm:text-3xl md:text-4xl">
					💡 Таньд таалагдаж магадгүй
				</h2>
				<p class="font-bold text-black/70 text-sm sm:text-base">
					Таны сонголтод тулгуурлан санал болгож байна
				</p>
			</div>

			<Show
				when={!products.loading && products()}
				fallback={
					<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
						{Array(4)
							.fill(0)
							.map((_, _i) => (
								<div class="h-[280px] animate-pulse rounded-sm border-3 border-black bg-muted/30 shadow-[4px_4px_0_0_#000] sm:h-[380px] sm:border-4 sm:shadow-[6px_6px_0_0_#000]" />
							))}
					</div>
				}
			>
				<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
					<For each={products()}>
						{(product) => {
							const randomColor =
								productColors[Math.floor(Math.random() * productColors.length)];
							const hasDiscount = product.discount && product.discount > 0;
							const originalPrice = product.price;
							const discountedPrice = hasDiscount
								? product.price * (1 - (product.discount || 0) / 100)
								: product.price;

							return (
								<a
									href={`/products/${product.slug}-${product.id}`}
									class="group relative block rounded-sm border-3 border-black bg-white shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] focus:outline-none focus:ring-2 focus:ring-black/40 sm:border-4 sm:shadow-[6px_6px_0_0_#000] sm:hover:translate-x-[3px] sm:hover:translate-y-[3px] sm:hover:shadow-[3px_3px_0_0_#000]"
								>
									{/* Image Section */}
									<div
										class="relative aspect-square overflow-hidden border-black border-b-3 sm:border-b-4"
										style={`background:${randomColor}`}
									>
										<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-[size:12px_12px] sm:bg-[size:14px_14px]" />

										<Show when={product.image}>
											<Image
												src={product.image}
												alt={product.name}
												width={300}
												height={300}
												layout="constrained"
												class="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105 sm:p-4"
												loading="lazy"
											/>
										</Show>

										{/* Discount Badge */}
										<Show when={hasDiscount}>
											<div class="absolute top-2 left-2 rounded-full border-2 border-black bg-destructive px-2 py-0.5 font-black text-[10px] text-white shadow-[2px_2px_0_0_#000] sm:top-3 sm:left-3 sm:px-2.5 sm:py-1 sm:text-xs">
												-{product.discount}%
											</div>
										</Show>

										{/* Brand Badge */}
										<div class="absolute right-2 bottom-2 rounded-full border-2 border-black bg-white px-2 py-0.5 font-black text-[9px] uppercase shadow-[2px_2px_0_0_#000] sm:right-2.5 sm:bottom-2.5 sm:px-2.5 sm:py-1 sm:text-[10px]">
											{product.brand}
										</div>
									</div>

									{/* Content Section */}
									<div class="p-2.5 sm:p-4">
										{/* Product Name */}
										<h3 class="mb-2 line-clamp-2 min-h-[32px] font-black text-xs leading-tight group-hover:underline sm:mb-3 sm:min-h-[44px] sm:text-base">
											{product.name}
										</h3>

										{/* Price Section */}
										<div class="flex flex-col gap-1 sm:gap-1.5">
											<Show when={hasDiscount}>
												<div class="font-bold text-[10px] text-black/40 line-through sm:text-sm">
													{formatCurrency(originalPrice)}
												</div>
											</Show>
											<div
												class={
													hasDiscount
														? "font-black text-base text-destructive sm:text-xl"
														: "font-black text-base sm:text-xl"
												}
											>
												{formatCurrency(discountedPrice)}
											</div>
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
