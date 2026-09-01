import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import { productStockState } from "@vit/shared/domain/product";
import { createMemo, createSignal, Show } from "solid-js";
import CardAddButton from "@/components/product/card-add-button";
import ProductImageFallback from "@/components/product/product-image-fallback";
import { trackSearchResultClicked } from "@/lib/analytics";
import { getProductImageProps } from "@/lib/image";
import { washBg } from "@/lib/wash";

export interface SearchResultProduct {
	brand: string;
	categoryId?: number;
	id: number;
	image: string;
	name: string;
	price: number;
	slug: string;
	stock?: number;
}

interface SearchResultRowProps {
	onNavigate?: () => void;
	position: number;
	product: SearchResultProduct;
	query: string;
	searchId: string | null;
}

const SearchResultRow = (props: SearchResultRowProps) => {
	const [imageFailed, setImageFailed] = createSignal(false);
	// Keep low and out-of-stock states aligned with the catalog and product page.
	const stockState = createMemo(() => productStockState(props.product.stock));
	const isInStock = () => stockState() !== "out";
	const isLowStock = () => stockState() === "low";

	const productUrl = () => `/products/${props.product.slug}-${props.product.id}`;
	const washClass = () => washBg(props.product.categoryId ?? "uncategorized");
	const imageProps = () => getProductImageProps(props.product.image, "thumb");

	const trackInteraction = () => {
		if (!props.searchId) {
			return;
		}
		trackSearchResultClicked(
			props.searchId,
			props.query,
			props.product.id,
			props.product.name,
			props.position,
		);
	};

	const handleClick = () => {
		trackInteraction();
		props.onNavigate?.();
	};

	return (
		<div class="border-border bg-card shadow-soft hover:shadow-soft-lg flex items-center gap-3 rounded-2xl border p-2.5 transition-shadow duration-200 ease-out">
			<div
				class={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl ${washClass()}`}
			>
				<Show
					fallback={<ProductImageFallback brand={props.product.brand} name={props.product.name} />}
					when={props.product.image && !imageFailed()}
				>
					<Image
						alt={props.product.name}
						class="h-full w-full object-contain p-1.5"
						decoding="async"
						height={imageProps().height}
						layout="constrained"
						loading="lazy"
						objectFit="contain"
						onError={() => setImageFailed(true)}
						sizes={imageProps().sizes}
						src={imageProps().src || props.product.image}
						width={imageProps().width}
					/>
				</Show>
			</div>

			<a class="flex min-w-0 flex-1 flex-col gap-0.5" href={productUrl()} onClick={handleClick}>
				<Show when={props.product.brand}>
					<span class="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
						{props.product.brand}
					</span>
				</Show>
				<span class="text-foreground line-clamp-2 text-sm leading-snug font-medium">
					{props.product.name}
				</span>
				<div class="mt-1 flex items-center gap-2">
					<span class="font-display text-base font-bold tracking-tight">
						{formatCurrency(props.product.price)}
					</span>
					<Show
						fallback={
							<span class="text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
								Дууссан
							</span>
						}
						when={isInStock()}
					>
						<Show when={isLowStock()}>
							<span class="low-stock-indicator rounded-full px-2 py-0.5 text-[10px] font-semibold">
								Цөөхөн үлдсэн
							</span>
						</Show>
					</Show>
				</div>
			</a>

			<CardAddButton
				cartItem={{
					image: props.product.image,
					name: props.product.name,
					price: props.product.price,
					productId: props.product.id,
					quantity: 1,
					slug: props.product.slug,
				}}
				onAdd={trackInteraction}
				productName={props.product.name}
			/>
		</div>
	);
};

export default SearchResultRow;
