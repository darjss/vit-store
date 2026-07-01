import { Image } from "@unpic/solid";
import { formatCurrency, productColors } from "@vit/shared";
import type { ProductCardData } from "@vit/shared/types";
import { createMemo, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
import AddToCartButton from "../cart/add-to-cart-button";
import ProductImageFallback from "./product-image-fallback";

/**
 * Normalized product shape shared by the catalog card and the search card.
 * Both upstream shapes (`ProductCardData` from the catalog query and the
 * Upstash search result) collapse into this via `normalizeProduct`.
 */
export interface NormalizedProduct {
	id: number;
	name: string;
	slug: string;
	price: number;
	image: string;
	brand: string | null;
}

/**
 * Search result shape from Upstash (see `SearchProductResult` in @vit/api).
 * Declared locally so the card does not depend on the api package internals.
 */
export interface SearchProductInput {
	id: number;
	name: string;
	slug: string;
	price: number;
	image: string;
	brand: string;
}

/** Collapse either upstream product shape into the normalized card shape. */
export function normalizeProduct(
	product: ProductCardData | SearchProductInput,
): NormalizedProduct {
	if ("images" in product) {
		return {
			id: product.id,
			name: product.name,
			slug: product.slug,
			price: product.price,
			image: product.images?.[0]?.url ?? "",
			brand: product.brand?.name ?? null,
		};
	}
	return { ...product, brand: product.brand ?? null };
}

interface ProductCardProps {
	product: ProductCardData | SearchProductInput;
}

const ProductCard = (props: ProductCardProps) => {
	const product = createMemo(() => normalizeProduct(props.product));

	const bgColor = createMemo(
		() => productColors[product().id % productColors.length],
	);
	const productImageProps = createMemo(() =>
		getProductImageProps(product().image, "card"),
	);
	const productUrl = `/products/${product().slug}-${product().id}`;
	const brandName = createMemo(() => product().brand);

	return (
		<div
			class="group hover:-translate-y-0.5 relative flex flex-col border border-border bg-card shadow-soft transition-all duration-200 ease-out-quart hover:shadow-soft-lg"
			data-product-id={product().id}
		>
			{/* Image Section — decorative link, primary link is heading below */}
			<a
				href={productUrl}
				class="relative block overflow-hidden border-border border-b-2"
				aria-hidden="true"
				tabIndex={-1}
			>
				<div
					class="relative aspect-4/5"
					style={{ background: bgColor() }}
				>
					{/* Dot Pattern Overlay */}
					<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />

					{/* Product Image */}
					<Show
						when={product().image}
						fallback={
							<ProductImageFallback
								name={product().name}
								brand={brandName()}
							/>
						}
					>
						<Image
							src={productImageProps().src || product().image}
							alt={product().name}
							width={productImageProps().width}
							height={productImageProps().height}
							sizes={productImageProps().sizes}
							layout="constrained"
							objectFit="contain"
							class="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 ease-out-quart group-hover:scale-105 sm:p-4"
							loading="lazy"
							decoding="async"
						/>
					</Show>

					{/* Brand Badge */}
					<Show when={brandName()}>
						<div class="absolute right-1.5 bottom-1.5 border border-border bg-card px-1.5 py-0.5 font-extrabold text-[11px] uppercase tracking-tight shadow-soft-sm sm:right-3 sm:bottom-3 sm:px-2.5 sm:py-1">
							{brandName()}
						</div>
					</Show>
				</div>
			</a>

			{/* Content Section */}
			<div class="flex flex-1 flex-col p-2 sm:p-3">
				<a href={productUrl} class="block">
					<h3 class="line-clamp-2 font-bold text-[11px] leading-tight tracking-tight group-hover:underline sm:text-sm sm:leading-snug">
						{product().name}
						{brandName() ? <span class="sr-only">, {brandName()}</span> : null}
					</h3>
				</a>
			</div>

			{/* Price & CTA Bar */}
			<div class="flex items-center justify-between gap-2 border-border border-t bg-primary/10 px-3 py-2.5 sm:gap-3 sm:border-t sm:px-4 sm:py-3">
				<div class="font-extrabold text-sm tracking-tight sm:text-lg">
					{formatCurrency(product().price)}
				</div>
				<AddToCartButton
					compact
					cartItem={{
						productId: product().id,
						quantity: 1,
						name: product().name,
						price: product().price,
						image: product().image,
						slug: product().slug,
					}}
				/>
			</div>
		</div>
	);
};

export default ProductCard;
