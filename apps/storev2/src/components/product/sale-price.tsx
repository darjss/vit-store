import { formatCurrency } from "@vit/shared";
import { productSale } from "@vit/shared/domain/product";
import { Show } from "solid-js";
import { cn } from "@/lib/utils";

interface SalePriceProps {
	class?: string;
	compareAtPrice?: number | null;
	price: number;
	productId: number;
}

// `data-sale` + `data-compare-at` let the inventory reconciler hide the sale
// marks once the live price is no longer below the compare-at price.

/** Round coral "-20%" sticker over a product photo. Renders nothing off sale. */
export function SaleSticker(props: SalePriceProps) {
	return (
		<Show when={productSale(props)}>
			{(sale) => (
				<span
					aria-label={`Хямдрал ${sale().percent} хувь`}
					class={cn(
						"border-cocoa bg-sale text-sale-foreground shadow-pop-sm font-display absolute top-2 left-2 grid size-12 -rotate-8 place-items-center rounded-full border-2 text-[13px] font-bold tracking-tight",
						props.class,
					)}
					data-compare-at={sale().compareAtPrice}
					data-sale={props.productId}
					data-sale-sticker
				>
					-{sale().percent}%
				</span>
			)}
		</Show>
	);
}

/** Card price: what checkout charges, then the struck pre-sale price and the amount saved. */
export function CardPrice(props: SalePriceProps) {
	return (
		<div class={cn("min-w-0", props.class)}>
			<div
				class="text-sm leading-tight font-bold tracking-tight [overflow-wrap:anywhere] sm:text-base"
				data-inventory-price={props.productId}
			>
				{formatCurrency(props.price)}
			</div>
			<Show when={productSale(props)}>
				{(sale) => (
					<div data-compare-at={sale().compareAtPrice} data-sale={props.productId}>
						<div class="text-muted-foreground text-xs tabular-nums line-through">
							{formatCurrency(sale().compareAtPrice)}
						</div>
						<span class="bg-success text-success-foreground mt-1 inline-block rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums">
							{formatCurrency(sale().saved)} хэмнэнэ
						</span>
					</div>
				)}
			</Show>
		</div>
	);
}
