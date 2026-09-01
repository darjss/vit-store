import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import {
	productStockState,
	projectProductCardDisplay,
	LOW_STOCK_THRESHOLD as SHARED_LOW_STOCK_THRESHOLD,
} from "@vit/shared/domain/product";
import type { ProductCardData } from "@vit/shared/types";
import { createMemo, createSignal, Show } from "solid-js";
import { Badge } from "@/components/ui/badge";
import { getProductImageProps } from "@/lib/image";
import { washBg } from "@/lib/wash";
import CardAddButton from "./card-add-button";
import { useInventorySnapshot } from "./inventory-reconciler";
import ProductImageFallback from "./product-image-fallback";

/**
 * Re-exported so existing imports (`from "./product-card"`) keep working.
 * The canonical threshold lives in `@vit/shared/domain/product`.
 */
export const LOW_STOCK_THRESHOLD = SHARED_LOW_STOCK_THRESHOLD;

/**
 * Normalized product shape shared by the catalog card and the search card.
 * Both upstream shapes (`ProductCardData` from the catalog query and the
 * Upstash search result) collapse into this via `normalizeProduct`.
 */
export interface NormalizedProduct {
	amount?: string | null;
	brand: string | null;
	categoryId?: number;
	discount?: number | null;
	id: number;
	image: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	stock?: number;
}

/**
 * Search result shape from Upstash (see `SearchProductResult` in @vit/api).
 * Declared locally so the card does not depend on the api package internals.
 */
export interface SearchProductInput {
	amount?: string | null;
	brand: string;
	categoryId?: number;
	discount?: number | null;
	id: number;
	image: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	stock?: number;
}

/** Collapse either upstream product shape into the normalized card shape. */
export function normalizeProduct(product: ProductCardData | SearchProductInput): NormalizedProduct {
	if ("images" in product) {
		return {
			amount: product.amount,
			brand: product.brand?.name ?? null,
			categoryId: product.categoryId,
			discount: product.discount,
			id: product.id,
			image: product.images?.[0]?.url ?? "",
			name: product.name,
			nameMn: product.nameMn ?? product.name_mn,
			potency: product.potency,
			price: product.price,
			slug: product.slug,
			stock: product.stock,
		};
	}
	return { ...product, brand: product.brand ?? null };
}

interface ProductCardProps {
	onInteract?: () => void;
	product: ProductCardData | SearchProductInput;
}

const ProductCard = (props: ProductCardProps) => {
	const product = createMemo(() => normalizeProduct(props.product));
	const inventory = useInventorySnapshot(product().id);

	const washClass = createMemo(() => washBg(product().categoryId ?? "uncategorized"));
	const productImageProps = createMemo(() => getProductImageProps(product().image, "card"));
	const productUrl = `/products/${product().slug}-${product().id}`;
	const brandName = createMemo(() => product().brand);
	const display = createMemo(() =>
		projectProductCardDisplay({
			amount: product().amount,
			brand: brandName(),
			name: product().name,
			nameMn: product().nameMn,
			potency: product().potency,
		}),
	);
	const stockState = createMemo(() => productStockState(inventory()?.stock ?? product().stock));
	const isOutOfStock = createMemo(() =>
		inventory()
			? inventory()?.status !== "active" || (inventory()?.stock ?? 0) <= 0
			: stockState() === "out",
	);
	const isLowStock = createMemo(() => !isOutOfStock() && stockState() === "low");
	const price = createMemo(() => inventory()?.price ?? product().price);
	const hasSale = createMemo(() => (product().discount ?? 0) > 0);
	const [imageFailed, setImageFailed] = createSignal(false);

	return (
		<div
			class="group border-border bg-card shadow-soft hover:shadow-soft-lg relative flex h-full flex-col overflow-hidden rounded-2xl border transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-[3px]"
			data-product-id={product().id}
		>
			{/* Image is decorative; the concise heading below is the card's only link. */}
			<div aria-hidden="true" class="relative block">
				<div
					class={`relative aspect-4/5 ${washClass()} ${isOutOfStock() ? "saturate-[0.35]" : ""}`}
				>
					<Show
						fallback={<ProductImageFallback brand={brandName()} name={product().name} />}
						when={product().image && !imageFailed()}
					>
						<Image
							alt=""
							class={`ease-out-quart absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105 sm:p-4 ${isOutOfStock() ? "opacity-70 grayscale" : ""}`}
							decoding="async"
							height={productImageProps().height}
							layout="constrained"
							loading="lazy"
							objectFit="contain"
							onError={() => setImageFailed(true)}
							sizes={productImageProps().sizes}
							src={productImageProps().src || product().image}
							width={productImageProps().width}
						/>
					</Show>
				</div>
			</div>
			<Show when={hasSale() && !isOutOfStock()}>
				<Badge
					aria-label={`Хямдрал ${product().discount} хувь`}
					class="absolute top-2 left-2 -rotate-2 px-2 py-0.5 text-[11px]"
					variant="sale"
				>
					-{product().discount}%
				</Badge>
			</Show>

			{/* Content Section */}
			<div class="flex flex-1 flex-col gap-1 p-3">
				<Show when={brandName()}>
					<p class="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
						{brandName()}
					</p>
				</Show>
				<a
					aria-label={`${display().accessibleName}, ${formatCurrency(price())}`}
					class="focus-visible:ring-ring block rounded-sm focus-visible:ring-2 focus-visible:outline-none"
					href={productUrl}
					onClick={props.onInteract}
				>
					<h3 class="text-foreground line-clamp-2 text-sm leading-snug font-semibold group-hover:underline">
						{display().shortName}
					</h3>
				</a>
				<Show when={display().dose}>
					<p class="text-foreground/80 line-clamp-2 text-[11px] leading-snug font-semibold">
						{display().dose}
					</p>
				</Show>
				<Show when={display().form || display().count || display().packageQuantity}>
					<p class="text-muted-foreground text-[11px] leading-snug">
						{[display().form, display().count, display().packageQuantity]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</Show>
				<p
					class={
						isOutOfStock()
							? "text-destructive text-[11px] font-semibold"
							: isLowStock()
								? "low-stock-indicator text-[11px] font-semibold"
								: "text-success-foreground text-[11px] font-semibold"
					}
					data-inventory-stock-badge={product().id}
				>
					{isOutOfStock() ? "Дууссан" : isLowStock() ? "Цөөхөн үлдсэн" : "Бэлэн байна"}
				</p>

				<div class="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-end gap-2 pt-2">
					<div
						class="min-w-0 text-sm leading-tight font-bold tracking-tight [overflow-wrap:anywhere] sm:text-base"
						data-inventory-price={product().id}
					>
						{formatCurrency(price())}
					</div>
					<CardAddButton
						cartItem={{
							image: product().image,
							name: product().name,
							price: product().price,
							productId: product().id,
							quantity: 1,
							slug: product().slug,
						}}
						onAdd={props.onInteract}
						outOfStock={isOutOfStock()}
						productName={display().shortName}
					/>
				</div>
			</div>
		</div>
	);
};

export default ProductCard;
