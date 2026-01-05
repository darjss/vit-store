import { createSignal, Show } from "solid-js";
import type { CartItems } from "@/lib/types";
import { cart } from "@/store/cart";
import IconCheck from "~icons/ri/check-line";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import { Button } from "../ui/button";

interface AddToCartButtonProps {
	cartItem: CartItems;
	compact?: boolean;
}

const AddToCartButton = (props: AddToCartButtonProps) => {
	const [isAdded, setIsAdded] = createSignal(false);

	const handleAddToCart = () => {
		cart.add(props.cartItem);
		setIsAdded(true);
		// Reset after animation
		setTimeout(() => setIsAdded(false), 1500);
	};

	const baseClasses =
		"flex touch-manipulation items-center justify-center gap-2 rounded-sm border-3 border-black font-black uppercase tracking-tight shadow-[4px_4px_0_0_#000] transition-all duration-200 hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0_0_#000] active:scale-[0.98] sm:border-4 sm:shadow-[5px_5px_0_0_#000] sm:hover:shadow-[3px_3px_0_0_#000]";
	const sizeClasses = props.compact
		? "w-auto px-3 py-2 text-[10px] sm:px-4 sm:py-2 sm:text-xs"
		: "w-full px-6 py-3 text-sm sm:text-base";

	return (
		<Button
			class={`${baseClasses} ${sizeClasses} ${isAdded() ? "bg-green-500 hover:bg-green-500" : "bg-primary hover:bg-primary/90"}`}
			type="button"
			onClick={handleAddToCart}
			disabled={isAdded()}
		>
			<Show
				when={isAdded()}
				fallback={
					<>
						<IconShoppingCart class="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
						<span class="hidden text-[10px] sm:inline sm:text-xs">Сагслах</span>
					</>
				}
			>
				<IconCheck class="h-4 w-4 animate-bounce text-white sm:h-5 sm:w-5" />
				<span class="hidden text-[10px] text-white sm:inline sm:text-xs">
					Нэмэгдлээ!
				</span>
			</Show>
		</Button>
	);
};

export default AddToCartButton;
