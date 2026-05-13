import { Image } from "@unpic/solid";
import { formatCurrency, productColors } from "@vit/shared";
import type { ProductCardData } from "@vit/shared/types";
import { createMemo, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
import AddToCartButton from "../cart/add-to-cart-button";

interface ProductCardProps {
	product: ProductCardData;
}

const ProductCard = (props: ProductCardProps) => {
	const product = props.product;

	const bgColor = createMemo(
		() => productColors[product.id % productColors.length],
	);
	const productImage = createMemo(() => product.images?.[0]?.url);
	const productImageProps = createMemo(() =>
		getProductImageProps(productImage() ?? "", "card"),
	);
	const productUrl = `/products/${product.slug}-${product.id}`;
	const brandName = createMemo(() => product.brand?.name);

	return (
		<div
			class="group hover:-translate-y-0.5 relative flex flex-col border-2 border-border bg-card shadow-hard transition-all duration-200 hover:shadow-hard-lg sm:border-3 sm:shadow-hard-lg sm:hover:shadow-hard-xl"
			data-product-id={product.id}
		>
			{/* Image Section — decorative link, primary link is heading below */}
			<a
				href={productUrl}
				class="relative block overflow-hidden border-border border-b-2 sm:border-b-3"
				aria-hidden="true"
				tabIndex={-1}
			>
				<div
					class="relative aspect-4/5 sm:aspect-4/3"
					style={{ background: bgColor() }}
				>
					{/* Dot Pattern Overlay */}
					<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />

					{/* Product Image */}
					<Show when={productImage()}>
						{(img) => (
							<Image
								src={productImageProps().src || img()}
								alt={product.name}
								width={productImageProps().width}
								height={productImageProps().height}
								sizes={productImageProps().sizes}
								layout="constrained"
								objectFit="contain"
								class="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105 sm:p-4"
								loading="lazy"
								decoding="async"
							/>
						)}
					</Show>

					{/* Brand Badge */}
					<Show when={brandName()}>
						<div class="absolute right-1.5 bottom-1.5 border-2 border-border bg-card px-1.5 py-0.5 font-black text-[8px] uppercase tracking-tight shadow-hard-sm sm:right-3 sm:bottom-3 sm:px-2.5 sm:py-1 sm:text-[10px]">
							{brandName()}
						</div>
					</Show>
				</div>
			</a>

			{/* Content Section */}
			<div class="flex flex-1 flex-col p-2 sm:p-3">
				<a href={productUrl} class="block">
					<h3 class="line-clamp-2 font-bold text-[11px] leading-tight tracking-tight group-hover:underline sm:text-sm sm:leading-snug">
						{product.name}
						{brandName() ? <span class="sr-only">, {brandName()}</span> : null}
					</h3>
				</a>
			</div>

			{/* Price & CTA Bar */}
			<div class="flex items-center justify-between gap-1.5 border-border border-t-2 bg-primary/10 px-2 py-1.5 sm:gap-2 sm:border-t-3 sm:px-3 sm:py-2">
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
						image: productImage() || "",
						slug: product.slug,
					}}
				/>
			</div>
		</div>
	);
};

export default ProductCard;
