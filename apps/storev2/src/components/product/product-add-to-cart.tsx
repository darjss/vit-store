import { createSignal, Match, Switch, createMemo, Suspense } from "solid-js";
import { Button } from "@/components/ui/button";
import { cart } from "@/store/cart";
import type { CartItems } from "@/lib/types";
import { useQuery } from "@tanstack/solid-query";
import { api } from "@/lib/trpc";
import { queryClient } from "@/lib/query";
import AddToCartButton from "../cart/add-to-cart-button";
interface ProductQuantitySelectorProps {
	cartItem: CartItems;
}

export default function ProductQuantitySelector(
	props: ProductQuantitySelectorProps,
) {
	const { productId } = props.cartItem;
	console.log("productId", productId);
	const statusQuery = useQuery(
		() => ({
			queryKey: ["is-product-in-stock", productId],
			queryFn: () => api.product.isProductInStock.query({ productId }),
		}),
		() => queryClient,
	);
	const isInStock = createMemo(() => statusQuery.data?.isInStock);
	console.log("isInStock", isInStock());
	const [quantity, setQuantity] = createSignal(1);

	const handleAddToCart = () => {
		console.log("props.cartItem", props.cartItem);
		console.log("quantity", quantity());
		cart.add({ ...props.cartItem, quantity: quantity() });
	};

	const increment = () => setQuantity((prev) => prev + 1);
	const decrement = () => setQuantity((prev) => Math.max(1, prev - 1));

	return (
		<Suspense fallback={<div>Loading...</div>}>
			<Switch>
				<Match when={isInStock()}>
					<div class="space-y-4">
						<div class="w-full">
							<div class="flex items-center gap-3">
								<button
									type="button"
									onClick={decrement}
									class="flex size-14 sm:size-16 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl sm:text-3xl shadow-[4px_4px_0_0_#000] transition-all hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
								>
									−
								</button>
								<div class="flex flex-1 items-center justify-center rounded-sm border-3 border-black bg-white px-6 py-4 font-black text-2xl sm:text-3xl shadow-[4px_4px_0_0_#000]">
									{quantity()}
								</div>
								<button
									type="button"
									onClick={increment}
									class="flex size-14 sm:size-16 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl sm:text-3xl shadow-[4px_4px_0_0_#000] transition-all hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] active:scale-95"
								>
									+
								</button>
							</div>
						</div>

						<AddToCartButton
							cartItem={{ ...props.cartItem, quantity: quantity() }}
						/>
					</div>
				</Match>
				<Match when={!isInStock()}>
					<div class="space-y-4">
						{/* Out of Stock Alert */}
						<div class="rounded-sm border-4 border-black bg-red-50 p-4 sm:p-6 shadow-[6px_6px_0_0_#000]">
							<div class="flex items-center gap-3 mb-3">
								<span class="text-2xl">⚠️</span>
								<h3 class="font-black text-lg sm:text-xl">Дууссан байна</h3>
							</div>
							<p class="text-sm sm:text-base font-medium text-gray-700">
								Уучлаарай, энэ бүтээгдэхүүн одоогоор дууссан байна. Та доорх
								товчийг дарж бараа орох үед мэдэгдэл авах боломжтой.
							</p>
						</div>

						{/* Notify Button */}
						<Button class="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-black text-base sm:text-lg py-6 rounded-sm border-3 border-black shadow-[4px_4px_0_0_#000] hover:shadow-[2px_2px_0_0_#000] hover:translate-x-[1px] hover:translate-y-[1px] transition-all active:scale-95">
							<span class="mr-2">🔔</span>
							Мэдэгдэл авах
						</Button>
					</div>
				</Match>
			</Switch>
		</Suspense>
	);
}
