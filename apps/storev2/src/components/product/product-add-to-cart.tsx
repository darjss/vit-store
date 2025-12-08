import { useQuery } from "@tanstack/solid-query";
import {
	createEffect,
	createMemo,
	createSignal,
	Match,
	Suspense,
	Switch,
} from "solid-js";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import type { CartItems } from "@/lib/types";
import AddToCartButton from "../cart/add-to-cart-button";
import IconAlertTriangle from "~icons/ri/error-warning-fill";
import IconNotification from "~icons/ri/notification-3-fill";

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
	const [quantity, setQuantity] = createSignal(1);
	const isInStock = createMemo(() => statusQuery.data?.isInStock);

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
									class="flex size-14 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-16 sm:text-3xl"
								>
									−
								</button>
								<div class="flex flex-1 items-center justify-center rounded-sm border-3 border-black bg-white px-6 py-4 font-black text-2xl shadow-[4px_4px_0_0_#000] sm:text-3xl">
									{quantity()}
								</div>
								<button
									type="button"
									onClick={increment}
									class="flex size-14 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-16 sm:text-3xl"
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
						<div class="animate-float-slow rounded-sm border-4 border-black bg-destructive/10 p-4 shadow-[6px_6px_0_0_#000] sm:p-6">
							<div class="mb-3 flex items-center gap-3">
								<IconAlertTriangle class="text-2xl text-yellow-500" />
								<h3 class="font-black text-destructive text-lg sm:text-xl">
									Дууссан байна
								</h3>
							</div>
							<p class="font-medium text-muted-foreground text-sm sm:text-base">
								Уучлаарай, энэ бүтээгдэхүүн одоогоор дууссан байна. Та доорх
								товчийг дарж бараа орох үед мэдэгдэл авах боломжтой.
							</p>
						</div>

						{/* Notify Button */}
						<Button class="w-full py-6 text-base sm:text-lg">
							<IconNotification class="mr-2 text-yellow-500" />
							Мэдэгдэл авах
						</Button>
					</div>
				</Match>
			</Switch>
		</Suspense>
	);
}
