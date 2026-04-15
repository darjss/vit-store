import { useQuery } from "@tanstack/solid-query";
import type { StoreAssistantDisplayType } from "@vit/api";
import type { Component } from "solid-js";
import { createEffect, createSignal, For, Match, Show, Switch } from "solid-js";
import {
	trackAssistantAddToCart,
	trackAssistantCheckoutClicked,
	trackAssistantProductsShown,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from "../ui/carousel";
import AssistantProductCard, {
	type AssistantProductCardData,
} from "./assistant-product-card";

interface AssistantProductDisplayProps {
	displayType: Exclude<StoreAssistantDisplayType, "none">;
	productIds: number[];
}

const AssistantProductDisplay: Component<AssistantProductDisplayProps> = (
	props,
) => {
	const [addedProductIds, setAddedProductIds] = createSignal<number[]>([]);
	const [hasTrackedImpression, setHasTrackedImpression] = createSignal(false);

	const productsQuery = useQuery(
		() => ({
			queryKey: ["assistant-products", ...props.productIds],
			queryFn: async () =>
				api.product.getProductsByIdsForAssistant.query({
					ids: props.productIds,
				}),
			enabled: props.productIds.length > 0,
		}),
		() => queryClient,
	);

	createEffect(() => {
		if (hasTrackedImpression() || !productsQuery.data?.length) {
			return;
		}

		trackAssistantProductsShown(
			props.displayType,
			productsQuery.data.map((product: AssistantProductCardData) => product.id),
		);
		setHasTrackedImpression(true);
	});

	const handleAddToCart = (product: AssistantProductCardData) => {
		cart.add(
			{
				productId: product.id,
				quantity: 1,
				name: product.name,
				price: product.price,
				image: product.image,
			},
			{ openDrawer: false },
		);
		trackAssistantAddToCart(product.id, product.name);
		setAddedProductIds((current) =>
			current.includes(product.id) ? current : [...current, product.id],
		);
	};

	return (
		<div class="mt-4 space-y-4">
			<Switch>
				<Match when={productsQuery.isLoading}>
					<div class="grid gap-3 sm:grid-cols-2">
						<For
							each={Array.from({
								length: Math.min(props.productIds.length, 2),
							})}
						>
							{() => (
								<div class="h-72 animate-pulse border-3 border-black bg-white shadow-[6px_6px_0_0_#000]" />
							)}
						</For>
					</div>
				</Match>
				<Match when={productsQuery.data?.length}>
					<div class="space-y-4">
						<Show when={props.displayType === "single-product"}>
							<div class="max-w-xl">
								<For each={productsQuery.data?.slice(0, 1)}>
									{(product) => (
										<AssistantProductCard
											product={product}
											onAddToCart={handleAddToCart}
										/>
									)}
								</For>
							</div>
						</Show>

						<Show when={props.displayType === "product-carousel"}>
							<Carousel
								opts={{
									align: "start",
									dragFree: true,
								}}
								class="px-1 sm:px-14"
							>
								<CarouselContent>
									<For each={productsQuery.data}>
										{(product) => (
											<CarouselItem class="basis-[88%] sm:basis-1/2 lg:basis-1/3">
												<AssistantProductCard
													product={product}
													onAddToCart={handleAddToCart}
												/>
											</CarouselItem>
										)}
									</For>
								</CarouselContent>
								<Show when={(productsQuery.data?.length ?? 0) > 1}>
									<CarouselPrevious class="-left-1 top-36 hidden sm:flex" />
									<CarouselNext class="-right-1 top-36 hidden sm:flex" />
								</Show>
							</Carousel>
						</Show>

						<Show when={addedProductIds().length > 0}>
							<div class="flex flex-col gap-3 border-3 border-black bg-[#F4F0E8] p-4 shadow-[6px_6px_0_0_#000] sm:flex-row sm:items-center sm:justify-between">
								<div>
									<p class="font-black text-sm uppercase tracking-wide">
										Сагсанд нэмэгдлээ
									</p>
									<p class="mt-1 text-black/70 text-sm">
										Үргэлжлүүлэн сонголтоо хийж болно, эсвэл шууд төлбөр рүү орж
										болно.
									</p>
								</div>
								<a
									href="/checkout"
									class="flex min-h-11 items-center justify-center rounded-sm border-3 border-black bg-black px-5 py-2 font-black text-white text-xs uppercase tracking-wide shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary hover:text-black hover:shadow-[2px_2px_0_0_#000]"
									onClick={() =>
										trackAssistantCheckoutClicked(addedProductIds())
									}
								>
									Checkout now
								</a>
							</div>
						</Show>
					</div>
				</Match>
			</Switch>
		</div>
	);
};

export default AssistantProductDisplay;
