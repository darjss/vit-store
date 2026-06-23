import type { CartItems } from "@vit/shared/types";
import { createSignal, Show } from "solid-js";
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

	const sizeClasses = props.compact
		? "w-auto px-3 py-2 text-[10px] sm:px-4 sm:py-2 sm:text-xs"
		: "w-full px-6 py-3 text-sm sm:text-base";

	const baseClasses = props.compact
		? "flex touch-manipulation items-center justify-center gap-1.5 border-2 border-border font-black uppercase tracking-tight shadow-hard-sm transition-all duration-200 hover:translate-x-px hover:translate-y-px hover:shadow-none active:scale-[0.98]"
		: "flex touch-manipulation items-center justify-center gap-2 border-3 border-border font-black uppercase tracking-tight shadow-hard-lg transition-all duration-200 hover:translate-x-px hover:translate-y-px hover:shadow-hard-sm active:scale-[0.98] sm:border-4 sm:shadow-hard-lg sm:hover:shadow-hard";

	return (
		<Button
			class={`${baseClasses} ${sizeClasses} ${isAdded() ? "bg-success hover:bg-success" : "bg-primary hover:bg-primary/90"}`}
			type="button"
			onClick={handleAddToCart}
			disabled={isAdded()}
			aria-label={props.compact ? "Сагслах" : undefined}
		>
			<Show
				when={isAdded()}
				fallback={
					<>
						<IconShoppingCart class="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" />
						<span class="hidden text-[10px] sm:inline sm:text-xs">Сагслах</span>
					</>
				}
			>
				<IconCheck class="h-4 w-4 text-background transition-transform duration-200 ease-out sm:h-5 sm:w-5" />
				<span class="hidden text-[10px] text-background sm:inline sm:text-xs">
					Нэмэгдлээ!
				</span>
			</Show>
		</Button>
	);
};

export default AddToCartButton;
