import type { CartItems } from "@vit/shared/types";
import { createSignal } from "solid-js";
import { cart } from "@/store/cart";
import { cn } from "@/lib/utils";
import IconCheck from "~icons/ri/check-line";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import { Button } from "../ui/button";

interface AddToCartButtonProps {
	cartItem: CartItems;
	compact?: boolean;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center gap-2 transition-[opacity,filter] duration-200 ease-out";

const AddToCartButton = (props: AddToCartButtonProps) => {
	const [isAdded, setIsAdded] = createSignal(false);

	const handleAddToCart = () => {
		cart.add(props.cartItem);
		setIsAdded(true);
		setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<Button
			class={cn(
				props.compact ? "" : "w-full",
				isAdded() && "bg-success text-success-foreground shadow-none",
			)}
			type="button"
			variant="default"
			size={props.compact ? "compact" : "default"}
			onClick={handleAddToCart}
			disabled={isAdded()}
			aria-label="Сагслах"
		>
			<span class="grid place-items-center">
				<span
					class={cn(
						stateClass,
						isAdded() && "opacity-0 blur-[2px]",
					)}
					aria-hidden={isAdded()}
				>
					<IconShoppingCart class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="hidden text-[11px] sm:inline sm:text-xs">Сагслах</span>
				</span>
				<span
					class={cn(
						stateClass,
						!isAdded() && "opacity-0 blur-[2px]",
					)}
					aria-hidden={!isAdded()}
				>
					<IconCheck class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="hidden text-[11px] sm:inline sm:text-xs">
						Нэмэгдлээ!
					</span>
				</span>
			</span>
		</Button>
	);
};

export default AddToCartButton;
