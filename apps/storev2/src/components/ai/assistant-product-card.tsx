import { formatCurrency, productColors } from "@vit/shared";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { toProductImageUrl } from "@/lib/image";
import { cn } from "@/lib/utils";

export interface AssistantProductCardData {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stockStatus: "in_stock" | "low_stock" | "out_of_stock";
}

interface AssistantProductCardProps {
	product: AssistantProductCardData;
	onAddToCart: (product: AssistantProductCardData) => void;
}

const stockBadgeLabel: Record<AssistantProductCardData["stockStatus"], string> =
	{
		in_stock: "Бэлэн",
		low_stock: "Цөөн үлдсэн",
		out_of_stock: "Дууссан",
	};

const stockBadgeClass: Record<AssistantProductCardData["stockStatus"], string> =
	{
		in_stock: "bg-[#D6F5D6]",
		low_stock: "bg-[#FFF0B8]",
		out_of_stock: "bg-[#FFD7D7]",
	};

const AssistantProductCard: Component<AssistantProductCardProps> = (props) => {
	const backgroundColor = createMemo(
		() => productColors[props.product.id % productColors.length],
	);
	const productUrl = createMemo(
		() => `/products/${props.product.slug}-${props.product.id}`,
	);
	const imageUrl = createMemo(
		() => toProductImageUrl(props.product.image, "sm") || props.product.image,
	);

	return (
		<div class="flex h-full flex-col overflow-hidden border-3 border-black bg-white shadow-[6px_6px_0_0_#000]">
			<a
				href={productUrl()}
				class="relative block border-black border-b-3"
				aria-label={props.product.name}
			>
				<div
					class="relative aspect-[4/3]"
					style={{ background: backgroundColor() }}
				>
					<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-size-[14px_14px]" />
					<Show when={props.product.image}>
						<img
							src={imageUrl()}
							alt={props.product.name}
							class="absolute inset-0 h-full w-full object-contain p-4"
							loading="lazy"
							width={360}
							height={280}
						/>
					</Show>
					<div
						class={cn(
							"absolute right-3 bottom-3 border-2 border-black px-2 py-1 font-black text-[10px] uppercase tracking-tight shadow-[2px_2px_0_0_#000]",
							stockBadgeClass[props.product.stockStatus],
						)}
					>
						{stockBadgeLabel[props.product.stockStatus]}
					</div>
				</div>
			</a>

			<div class="flex flex-1 flex-col p-4">
				<div class="mb-3 flex items-start justify-between gap-3">
					<Show when={props.product.brand}>
						<span class="border-2 border-black bg-black px-2 py-1 font-black text-[10px] text-white uppercase tracking-[0.18em]">
							{props.product.brand}
						</span>
					</Show>
				</div>

				<a href={productUrl()} class="block">
					<h3 class="line-clamp-3 font-black text-base leading-tight hover:underline">
						{props.product.name}
					</h3>
				</a>

				<div class="mt-auto pt-5">
					<div class="mb-3 font-black text-2xl tracking-tight">
						{formatCurrency(props.product.price)}
					</div>
					<div class="grid grid-cols-[1fr_auto] gap-2">
						<button
							type="button"
							class="flex min-h-11 items-center justify-center rounded-sm border-3 border-black bg-primary px-4 py-2 font-black text-xs uppercase tracking-wide shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_0_#000] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500 disabled:shadow-none"
							onClick={() => props.onAddToCart(props.product)}
							disabled={props.product.stockStatus === "out_of_stock"}
						>
							{props.product.stockStatus === "out_of_stock"
								? "Дууссан"
								: "Сагсанд нэмэх"}
						</button>
						<a
							href={productUrl()}
							class="flex min-h-11 items-center justify-center rounded-sm border-3 border-black bg-white px-4 py-2 font-black text-xs uppercase tracking-wide shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-black hover:text-white hover:shadow-[2px_2px_0_0_#000]"
						>
							Дэлгэрэнгүй
						</a>
					</div>
				</div>
			</div>
		</div>
	);
};

export default AssistantProductCard;
