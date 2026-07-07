import type { CartItems } from "@vit/shared/types";
import { createSignal } from "solid-js";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import IconCheck from "~icons/ri/check-line";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";

interface CardAddButtonProps {
	cartItem: CartItems;
	disabled?: boolean;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center transition-[opacity,filter] duration-200 ease-out";

/**
 * The product card's round butter cart button — the card's single Neopop
 * element (shadow-pop-sm, press translates into the shadow). Morphs to a
 * check via blur crossfade after adding.
 */
const CardAddButton = (props: CardAddButtonProps) => {
	const [isAdded, setIsAdded] = createSignal(false);

	const handleAdd = () => {
		if (props.disabled || isAdded()) return;
		cart.add(props.cartItem, { openDrawer: false });
		setIsAdded(true);
		setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<button
			type="button"
			onClick={handleAdd}
			disabled={props.disabled || isAdded()}
			aria-label={props.disabled ? "Дууссан" : "Сагслах"}
			class={cn(
				"flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cocoa bg-primary text-primary-foreground shadow-pop-sm transition-[transform,box-shadow,background-color] duration-150 ease-out",
				"active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
				isAdded() && "bg-success text-success-foreground",
				props.disabled &&
					"cursor-not-allowed border-border bg-muted text-muted-foreground shadow-none active:translate-x-0 active:translate-y-0",
			)}
		>
			<span class="grid place-items-center">
				<span
					class={cn(stateClass, isAdded() && "opacity-0 blur-[2px]")}
					aria-hidden={isAdded()}
				>
					<IconShoppingCart class="h-5 w-5" />
				</span>
				<span
					class={cn(stateClass, !isAdded() && "opacity-0 blur-[2px]")}
					aria-hidden={!isAdded()}
				>
					<IconCheck class="h-5 w-5" />
				</span>
			</span>
		</button>
	);
};

export default CardAddButton;
