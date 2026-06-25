import type { CartItems } from "@vit/shared/types";
import { createSignal, Show } from "solid-js";
import { cart } from "@/store/cart";
import { cn } from "@/lib/utils";
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

	return (
		<Button
			class={cn(
				// Product-page CTA uses the hero/CTA border token (4px).
				props.compact ? "" : "w-full border-4 sm:shadow-hard-lg",
				isAdded() ? "bg-success hover:bg-success" : "bg-primary hover:bg-primary/90",
			)}
			type="button"
			variant="default"
			size={props.compact ? "compact" : "default"}
			onClick={handleAddToCart}
			disabled={isAdded()}
			aria-label={props.compact ? "Сагслах" : undefined}
		>
			<Show
				when={isAdded()}
				fallback={
					<>
						<IconShoppingCart class="h-4 w-4 text-primary-foreground sm:h-5 sm:w-5" />
						<span class="hidden text-[11px] sm:inline sm:text-xs">Сагслах</span>
					</>
				}
			>
				<IconCheck class="h-4 w-4 text-background transition-transform duration-200 ease-out-quart sm:h-5 sm:w-5" />
				<span class="hidden text-[11px] text-background sm:inline sm:text-xs">
					Нэмэгдлээ!
				</span>
			</Show>
		</Button>
	);
};

export default AddToCartButton;
