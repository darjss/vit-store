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
	id: number;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	amount?: string | null;
	slug: string;
	price: number;
	image: string;
	brand: string | null;
	stock?: number;
	discount?: number | null;
	categoryId?: number;
}

/**
 * Search result shape from Upstash (see `SearchProductResult` in @vit/api).
 * Declared locally so the card does not depend on the api package internals.
 */
export interface SearchProductInput {
	id: number;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	amount?: string | null;
	slug: string;
	price: number;
	image: string;
	brand: string;
	stock?: number;
	discount?: number | null;
	categoryId?: number;
}

/** Collapse either upstream product shape into the normalized card shape. */
export function normalizeProduct(
	product: ProductCardData | SearchProductInput,
): NormalizedProduct {
	if ("images" in product) {
		return {
			id: product.id,
			name: product.name,
			nameMn: product.nameMn ?? product.name_mn,
			potency: product.potency,
			amount: product.amount,
			slug: product.slug,
			price: product.price,
			image: product.images?.[0]?.url ?? "",
			brand: product.brand?.name ?? null,
			stock: product.stock,
			discount: product.discount,
			categoryId: product.categoryId,
		};
	}
	return { ...product, brand: product.brand ?? null };
}

interface ProductCardProps {
	product: ProductCardData | SearchProductInput;
}

const ProductCard = (props: ProductCardProps) => {
	const product = createMemo(() => normalizeProduct(props.product));
	const inventory = useInventorySnapshot(product().id);

	const washClass = createMemo(() =>
		washBg(product().categoryId ?? "uncategorized"),
	);
	const productImageProps = createMemo(() =>
		getProductImageProps(product().image, "card"),
	);
	const productUrl = `/products/${product().slug}-${product().id}`;
	const brandName = createMemo(() => product().brand);
	const display = createMemo(() =>
		projectProductCardDisplay({
			name: product().name,
			nameMn: product().nameMn,
			brand: brandName(),
			potency: product().potency,
			amount: product().amount,
		}),
	);
	const stockState = createMemo(() =>
		productStockState(inventory()?.stock ?? product().stock),
	);
	const isOutOfStock = createMemo(() =>
		inventory()
			? inventory()?.status !== "active" || (inventory()?.stock ?? 0) <= 0
			: stockState() === "out",
	);
	const isLowStock = createMemo(
		() => !isOutOfStock() && stockState() === "low",
	);
	const price = createMemo(() => inventory()?.price ?? product().price);
	const hasSale = createMemo(() => (product().discount ?? 0) > 0);
	const [imageFailed, setImageFailed] = createSignal(false);

	return (
		<div
			class="group hover:-translate-y-[3px] relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-[transform,box-shadow] duration-200 ease-out hover:shadow-soft-lg"
			data-product-id={product().id}
		>
			{/* Image is decorative; the concise heading below is the card's only link. */}
			<div class="relative block" aria-hidden="true">
				<div
					class={`relative aspect-4/5 ${washClass()} ${isOutOfStock() ? "saturate-[0.35]" : ""}`}
				>
					<Show
						when={product().image && !imageFailed()}
						fallback={
							<ProductImageFallback name={product().name} brand={brandName()} />
						}
					>
						<Image
							src={productImageProps().src || product().image}
							alt=""
							width={productImageProps().width}
							height={productImageProps().height}
							sizes={productImageProps().sizes}
							layout="constrained"
							objectFit="contain"
							class={`absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-300 ease-out-quart group-hover:scale-105 sm:p-4 ${isOutOfStock() ? "opacity-70 grayscale" : ""}`}
							loading="lazy"
							decoding="async"
							onError={() => setImageFailed(true)}
						/>
					</Show>
				</div>
			</div>
			<Show when={hasSale() && !isOutOfStock()}>
				<Badge
					variant="sale"
					class="-rotate-2 absolute top-2 left-2 px-2 py-0.5 text-[11px]"
					aria-label={`Хямдрал ${product().discount} хувь`}
				>
					-{product().discount}%
				</Badge>
			</Show>

			{/* Content Section */}
			<div class="flex flex-1 flex-col gap-1 p-3">
				<Show when={brandName()}>
					<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wide">
						{brandName()}
					</p>
				</Show>
				<a
					href={productUrl}
					class="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`${display().accessibleName}, ${formatCurrency(price())}`}
				>
					<h3 class="line-clamp-2 font-semibold text-foreground text-sm leading-snug group-hover:underline">
						{display().shortName}
					</h3>
				</a>
				<Show when={display().dose}>
					<p class="line-clamp-2 font-semibold text-[11px] text-foreground/80 leading-snug">
						{display().dose}
					</p>
				</Show>
				<Show when={display().form || display().count || display().packageQuantity}>
					<p class="text-[11px] text-muted-foreground leading-snug">
						{[display().form, display().count, display().packageQuantity]
							.filter(Boolean)
							.join(" · ")}
					</p>
				</Show>
				<p
					data-inventory-stock-badge={product().id}
					class={
						isOutOfStock()
							? "font-semibold text-[11px] text-destructive"
							: isLowStock()
								? "font-semibold text-[11px] text-warning-foreground"
								: "font-semibold text-[11px] text-success-foreground"
					}
				>
					{isOutOfStock()
						? "Дууссан"
						: isLowStock()
							? "Цөөн үлдсэн"
							: "Бэлэн байна"}
				</p>

				<div class="mt-auto grid min-w-0 grid-cols-[minmax(0,1fr)_44px] items-end gap-2 pt-2">
					<div
						class="min-w-0 font-bold text-sm leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-base"
						data-inventory-price={product().id}
					>
						{formatCurrency(price())}
					</div>
					<CardAddButton
						outOfStock={isOutOfStock()}
						productName={display().shortName}
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
		</div>
	);
};

export default ProductCard;
