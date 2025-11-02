import { createResource, For, Show } from "solid-js";
import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared/utils";
import { productColors } from "@/lib/constant";
import AddToCartButton from "../cart/add-to-cart-button";
import type { ProductForHome } from "@/lib/types";
import { api } from "@/lib/trpc";

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
				<h2 class="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight mb-1.5 sm:mb-2">
					💡 Таньд таалагдаж магадгүй
				</h2>
				<p class="text-sm sm:text-base text-black/70 font-bold">
					Таны сонголтод тулгуурлан санал болгож байна
				</p>
			</div>

			<Show
				when={!products.loading && products()}
				fallback={
					<div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
						{Array(4)
							.fill(0)
							.map((_, i) => (
								<div class="h-[280px] sm:h-[380px] rounded-sm border-3 sm:border-4 border-black bg-muted/30 shadow-[4px_4px_0_0_#000] sm:shadow-[6px_6px_0_0_#000] animate-pulse" />
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
									class="group relative block rounded-sm border-3 sm:border-4 border-black bg-white shadow-[4px_4px_0_0_#000] sm:shadow-[6px_6px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] sm:hover:shadow-[3px_3px_0_0_#000] hover:translate-x-[2px] sm:hover:translate-x-[3px] hover:translate-y-[2px] sm:hover:translate-y-[3px] transition-all focus:outline-none focus:ring-2 focus:ring-black/40"
								>
									{/* Image Section */}
									<div
										class="relative aspect-square overflow-hidden border-b-3 sm:border-b-4 border-black"
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
												class="absolute inset-0 w-full h-full object-contain p-3 sm:p-4 group-hover:scale-105 transition-transform duration-300"
												loading="lazy"
											/>
										</Show>

										{/* Discount Badge */}
										<Show when={hasDiscount}>
											<div class="absolute top-2 left-2 sm:top-3 sm:left-3 rounded-full border-2 border-black bg-destructive px-2 sm:px-2.5 py-0.5 sm:py-1 text-[10px] sm:text-xs font-black text-white shadow-[2px_2px_0_0_#000]">
												-{product.discount}%
											</div>
										</Show>

										{/* Brand Badge */}
										<div class="absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 rounded-full border-2 border-black bg-white px-2 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-black uppercase shadow-[2px_2px_0_0_#000]">
											{product.brand}
										</div>
									</div>

									{/* Content Section */}
									<div class="p-2.5 sm:p-4">
										{/* Product Name */}
										<h3 class="mb-2 sm:mb-3 text-xs sm:text-base font-black leading-tight group-hover:underline line-clamp-2 min-h-[32px] sm:min-h-[44px]">
											{product.name}
										</h3>

										{/* Price Section */}
										<div class="flex flex-col gap-1 sm:gap-1.5">
											<Show when={hasDiscount}>
												<div class="text-[10px] sm:text-sm font-bold text-black/40 line-through">
													{formatCurrency(originalPrice)}
												</div>
											</Show>
											<div
												class={
													hasDiscount
														? "text-base sm:text-xl font-black text-destructive"
														: "text-base sm:text-xl font-black"
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
