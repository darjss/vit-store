import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import type { ProductForHome } from "@vit/shared/types";
import {
	createMemo,
	createResource,
	createSignal,
	For,
	onCleanup,
	Show,
} from "solid-js";
import CardAddButton from "@/components/product/card-add-button";
import ProductImageFallback from "@/components/product/product-image-fallback";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";

const CROSS_SELL_TIMEOUT_MS = 5000;

async function fetchCartCrossSells(
	productIds: number[],
	signal: AbortSignal,
): Promise<ProductForHome[]> {
	if (productIds.length === 0) return [];
	try {
		const products = await api.product.getCartCrossSells.query(
			{ productIds },
			{ signal },
		);
		return products.map((p) => ({
			id: p.id,
			slug: p.slug,
			name: p.name,
			price: p.price,
			image: p.image,
			brand: p.brand,
			stock: p.stock,
		}));
	} catch {
		return [];
	}
}

export default function CartCrossSells() {
	let activeRequest: AbortController | undefined;

	const productIdsKey = createMemo(() =>
		[...new Set(cart.items().map((item) => item.productId))]
			.sort((a, b) => a - b)
			.join(","),
	);

	const [crossSells] = createResource(productIdsKey, async (key) => {
		if (!key) return Promise.resolve([] as ProductForHome[]);
		activeRequest?.abort();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), CROSS_SELL_TIMEOUT_MS);
		activeRequest = controller;
		try {
			return await fetchCartCrossSells(key.split(",").map(Number), controller.signal);
		} finally {
			clearTimeout(timeout);
			if (activeRequest === controller) activeRequest = undefined;
		}
	});

	onCleanup(() => activeRequest?.abort());

	return (
		<Show when={!crossSells.loading && crossSells()} keyed>
			{(list) => (
				<Show when={list.length > 0}>
					<div class="border-border border-t px-4 py-4">
						<p class="mb-3 font-semibold text-foreground text-sm">
							Сагсанд нэмэх үү?
						</p>
						<div class="space-y-2">
							<For each={list}>
								{(product) => {
									const imageProps = getProductImageProps(
										product.image,
										"card",
									);
									const [imageFailed, setImageFailed] = createSignal(false);
									const productUrl = `/products/${product.slug}-${product.id}/`;

									return (
										<div class="flex items-center gap-3 rounded-2xl border border-border bg-card p-2.5 shadow-soft-sm">
											<a
												href={productUrl}
												onClick={() => cart.closeDrawer()}
												class={`block size-14 shrink-0 overflow-hidden rounded-xl ${washBg(product.id)}`}
											>
												<Show
													when={product.image && !imageFailed()}
													fallback={
														<ProductImageFallback
															name={product.name}
															brand={product.brand}
														/>
													}
												>
													<Image
														src={imageProps.src || product.image}
														alt={product.name}
														width={56}
														height={56}
														layout="fixed"
														class="h-full w-full object-contain p-1"
														loading="lazy"
														decoding="async"
														onError={() => setImageFailed(true)}
													/>
												</Show>
											</a>

											<div class="min-w-0 flex-1">
												<a
													href={productUrl}
													onClick={() => cart.closeDrawer()}
													class="line-clamp-2 font-medium text-foreground text-sm leading-snug hover:underline"
												>
													{product.name}
												</a>
												<p class="mt-0.5 font-display text-sm">
													{formatCurrency(product.price)}
												</p>
											</div>

											<CardAddButton
												cartItem={{
													productId: product.id,
													quantity: 1,
													name: product.name,
													price: product.price,
													image: product.image,
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
