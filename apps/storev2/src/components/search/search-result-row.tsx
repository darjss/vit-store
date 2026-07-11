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
	id: number;
	name: string;
	slug: string;
	price: number;
	brand: string;
	image: string;
	stock?: number;
	categoryId?: number;
}

interface SearchResultRowProps {
	product: SearchResultProduct;
	query: string;
	position: number;
	onNavigate?: () => void;
}

const SearchResultRow = (props: SearchResultRowProps) => {
	const [imageFailed, setImageFailed] = createSignal(false);
	// Same canonical stock state as the catalog/PDP cards so a row that says
	// "Нөөцтэй" never clicks through to a PDP that says "Цөөн үлдсэн".
	const stockState = createMemo(() => productStockState(props.product.stock));
	const isInStock = () => stockState() !== "out";
	const isLowStock = () => stockState() === "low";

	const productUrl = () =>
		`/products/${props.product.slug}-${props.product.id}`;
	const washClass = () => washBg(props.product.categoryId ?? "uncategorized");
	const imageProps = () => getProductImageProps(props.product.image, "thumb");

	const handleClick = () => {
		trackSearchResultClicked(
			props.query,
			props.product.id,
			props.product.name,
			props.position,
		);
		props.onNavigate?.();
	};

	return (
		<div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-soft transition-shadow duration-200 ease-out hover:shadow-soft-lg">
			<div
				class={`relative grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl ${washClass()}`}
			>
				<Show
					when={props.product.image && !imageFailed()}
					fallback={
						<ProductImageFallback
							name={props.product.name}
							brand={props.product.brand}
						/>
					}
				>
					<Image
						src={imageProps().src || props.product.image}
						alt={props.product.name}
						width={imageProps().width}
						height={imageProps().height}
						sizes={imageProps().sizes}
						layout="constrained"
						objectFit="contain"
						class="h-full w-full object-contain p-1.5"
						loading="lazy"
						decoding="async"
						onError={() => setImageFailed(true)}
					/>
				</Show>
			</div>

			<a
				href={productUrl()}
				onClick={handleClick}
				class="flex min-w-0 flex-1 flex-col gap-0.5"
			>
				<Show when={props.product.brand}>
					<span class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
						{props.product.brand}
					</span>
				</Show>
				<span class="line-clamp-2 font-medium text-foreground text-sm leading-snug">
					{props.product.name}
				</span>
				<div class="mt-1 flex items-center gap-2">
					<span class="font-bold font-display text-base tracking-tight">
						{formatCurrency(props.product.price)}
					</span>
					<Show
						when={isInStock()}
						fallback={
							<span class="rounded-full px-2 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
								Дууссан
							</span>
						}
					>
						<Show
							when={isLowStock()}
							fallback={
								<span class="rounded-full bg-success/30 px-2 py-0.5 font-semibold text-[10px] text-success uppercase tracking-wide">
									Нөөцтэй
								</span>
							}
						>
							<span class="rounded-full bg-warning px-2 py-0.5 font-semibold text-[10px] text-warning-foreground uppercase tracking-wide">
								Цөөн үлдсэн
							</span>
						</Show>
					</Show>
				</div>
			</a>

			<CardAddButton
				productName={props.product.name}
				cartItem={{
					productId: props.product.id,
					quantity: 1,
					name: props.product.name,
					price: props.product.price,
					image: props.product.image,
					slug: props.product.slug,
				}}
			/>
		</div>
	);
};

export default SearchResultRow;
