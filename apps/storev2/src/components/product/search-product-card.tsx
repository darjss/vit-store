import { formatCurrency } from "@vit/shared/utils";
import { createMemo, Show } from "solid-js";
import { productColors } from "@/lib/constant";
import AddToCartButton from "../cart/add-to-cart-button";

// Search result format from Upstash
export interface SearchProductData {
	id: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	image: string;
}

interface SearchProductCardProps {
	product: SearchProductData;
}

const SearchProductCard = (props: SearchProductCardProps) => {
	const product = props.product;

	// Use product ID to get consistent color per product
	const bgColor = createMemo(
		() => productColors[product.id % productColors.length],
	);
	const productUrl = `/products/${product.slug}-${product.id}`;

	return (
		<div
			class="group hover:-translate-y-0.5 relative flex flex-col border-2 border-black bg-white shadow-[3px_3px_0_0_#000] transition-all duration-200 hover:shadow-[4px_4px_0_0_#000] sm:border-3 sm:shadow-[5px_5px_0_0_#000] sm:hover:shadow-[6px_6px_0_0_#000]"
			data-product-id={product.id}
		>
			{/* Image Section */}
			<a
				href={productUrl}
				class="relative block overflow-hidden border-black border-b-2 sm:border-b-3"
				aria-label={`${product.name}${product.brand ? ` by ${product.brand}` : ""}`}
			>
				<div
					class="relative aspect-4/5 sm:aspect-4/3"
					style={{ background: bgColor() }}
				>
					{/* Dot Pattern Overlay */}
					<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />

					{/* Product Image */}
					<Show when={product.image}>
						<img
							src={product.image}
							alt={product.name}
							class="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105 sm:p-4"
							width={400}
							height={500}
							loading="lazy"
						/>
					</Show>

					{/* Brand Badge */}
					<Show when={product.brand}>
						<div class="absolute right-1.5 bottom-1.5 rounded-sm border-2 border-black bg-white px-1.5 py-0.5 font-black text-[8px] uppercase tracking-tight shadow-[2px_2px_0_0_#000] sm:right-3 sm:bottom-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
							{product.brand}
						</div>
					</Show>
				</div>
			</a>

			{/* Content Section */}
			<div class="flex flex-1 flex-col p-2 sm:p-3">
				<a href={productUrl} class="block">
					<h3 class="line-clamp-2 font-bold text-[11px] leading-tight tracking-tight group-hover:underline sm:text-sm sm:leading-snug">
						{product.name}
					</h3>
				</a>
			</div>

			{/* Price & CTA Bar */}
			<div class="flex items-center justify-between gap-1.5 border-black border-t-2 bg-primary/10 px-2 py-1.5 sm:gap-2 sm:border-t-3 sm:px-3 sm:py-2">
				<div class="font-black text-sm tracking-tight sm:text-lg">
					{formatCurrency(product.price)}
				</div>
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
	);
};

export default SearchProductCard;
