import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import type { ProductForHome } from "@vit/shared/types";
import { createMemo, createResource, createSignal, For, onCleanup, Show } from "solid-js";
import CardAddButton from "@/components/product/card-add-button";
import ProductImageFallback from "@/components/product/product-image-fallback";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";

const CROSS_SELL_TIMEOUT_MS = 5000;

async function fetchCartCrossSells(
	productIds: Array<number>,
	signal: AbortSignal,
): Promise<Array<ProductForHome>> {
	if (productIds.length === 0) {
		return [];
	}
	try {
		const products = await api.product.getCartCrossSells.query({ productIds }, { signal });
		return products.map((p) => ({
			brand: p.brand,
			id: p.id,
			image: p.image,
			name: p.name,
			price: p.price,
			slug: p.slug,
			stock: p.stock,
		}));
	} catch {
		return [];
	}
}

export default function CartCrossSells() {
	let activeRequest: AbortController | undefined;

	const productIdsKey = createMemo(() =>
		[...new Set(cart.items().map((item) => item.productId))].sort((a, b) => a - b).join(","),
	);

	const [crossSells] = createResource(productIdsKey, async (key) => {
		if (!key) {
			return [] satisfies Array<ProductForHome>;
		}
		activeRequest?.abort();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), CROSS_SELL_TIMEOUT_MS);
		activeRequest = controller;
		try {
			return await fetchCartCrossSells(key.split(",").map(Number), controller.signal);
		} finally {
			clearTimeout(timeout);
			if (activeRequest === controller) {
				activeRequest = undefined;
			}
		}
	});

	onCleanup(() => activeRequest?.abort());

	return (
		<Show keyed when={!crossSells.loading && crossSells()}>
			{(list) => (
				<Show when={list.length > 0}>
					<div class="border-border border-t px-4 py-4">
						<p class="text-foreground mb-3 text-sm font-semibold">Сагсанд нэмэх үү?</p>
						<div class="space-y-2">
							<For each={list}>
								{(product) => {
									const imageProps = getProductImageProps(product.image, "card");
									const [imageFailed, setImageFailed] = createSignal(false);
									const productUrl = `/products/${product.slug}-${product.id}/`;

									return (
										<div class="border-border bg-card shadow-soft-sm flex items-center gap-3 rounded-2xl border p-2.5">
											<a
												class={`block size-14 shrink-0 overflow-hidden rounded-xl ${washBg(product.id)}`}
												href={productUrl}
												onClick={() => cart.closeDrawer()}
											>
												<Show
													fallback={
														<ProductImageFallback brand={product.brand} name={product.name} />
													}
													when={product.image && !imageFailed()}
												>
													<Image
														alt={product.name}
														class="h-full w-full object-contain p-1"
														decoding="async"
														height={56}
														layout="fixed"
														loading="lazy"
														onError={() => setImageFailed(true)}
														src={imageProps.src || product.image}
														width={56}
													/>
												</Show>
											</a>

											<div class="min-w-0 flex-1">
												<a
													class="text-foreground line-clamp-2 text-sm leading-snug font-medium hover:underline"
													href={productUrl}
													onClick={() => cart.closeDrawer()}
												>
													{product.name}
												</a>
												<p class="font-display mt-0.5 text-sm">{formatCurrency(product.price)}</p>
											</div>

											<CardAddButton
												cartItem={{
													image: product.image,
													name: product.name,
													price: product.price,
													productId: product.id,
													quantity: 1,
													slug: product.slug,
												}}
											/>
										</div>
									);
								}}
							</For>
						</div>
					</div>
				</Show>
			)}
		</Show>
	);
}
