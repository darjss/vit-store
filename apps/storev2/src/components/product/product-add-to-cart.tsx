import { createSignal } from "solid-js";
import { Button } from "@/components/ui/button";
import { cart } from "@/store/cart";
import type { CartItems } from "@/lib/types";

interface ProductAddToCartProps {
	cartItem: CartItems;
}

export default function ProductAddToCart(props: ProductAddToCartProps) {
	const [quantity, setQuantity] = createSignal(1);

	const handleAddToCart = () => {
		console.log("props.cartItem", props.cartItem);
		console.log("quantity", quantity());
		cart.add({ ...props.cartItem, quantity: quantity() });
	};

	const increment = () => setQuantity((prev) => prev + 1);
	const decrement = () => setQuantity((prev) => Math.max(1, prev - 1));

	return (
		<div class="space-y-4">
			{/* Quantity Selector - Full Width on Mobile */}
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

			{/* Add to Cart Button - Full Width */}
			<Button
				onClick={handleAddToCart}
				class="w-full rounded-sm border-6 border-black bg-primary px-8 py-6 sm:py-8 font-black text-lg sm:text-xl uppercase shadow-[8px_8px_0_0_#000] sm:shadow-[12px_12px_0_0_#000] transition-all hover:shadow-[4px_4px_0_0_#000] sm:hover:shadow-[6px_6px_0_0_#000] hover:translate-x-[4px] sm:hover:translate-x-[6px] hover:translate-y-[4px] sm:hover:translate-y-[6px] active:scale-95"
			>
				<span class="text-2xl sm:text-3xl mr-2 sm:mr-3">🛒</span>
				<span>Сагсанд нэмэх</span>
			</Button>
		</div>
	);
}
