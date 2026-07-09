import { Image } from "@unpic/solid";
import { formatCurrency } from "@vit/shared";
import type { ProductForHome } from "@vit/shared/types";
import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import CardAddButton from "@/components/product/card-add-button";
import ProductImageFallback from "@/components/product/product-image-fallback";
import { getProductImageProps } from "@/lib/image";
import { api } from "@/lib/trpc";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";

const CROSS_SELL_TIMEOUT_MS = 5000;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) =>
			setTimeout(
				() => reject(new Error(`cart cross-sells timed out after ${ms}ms`)),
				ms,
			),
		),
	]);

async function fetchCartCrossSells(
	productIds: number[],
): Promise<ProductForHome[]> {
	if (productIds.length === 0) return [];
	try {
		const products = await withTimeout(
			api.product.getCartCrossSells.query({ productIds }),
			CROSS_SELL_TIMEOUT_MS,
		);
		return products
			.filter((p) => p.slug && (p.stock === undefined || p.stock > 0))
			.slice(0, 2)
			.map((p) => ({
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
	const productIds = createMemo(() =>
		cart.items().map((item) => item.productId),
	);

	const [crossSells] = createResource(productIds, fetchCartCrossSells);

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
												productName={product.name}
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
