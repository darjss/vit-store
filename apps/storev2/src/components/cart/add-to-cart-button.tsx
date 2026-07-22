import { CheckCircleIcon as IconCheck } from "@solar-icons/solid/bold";
import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import type { CartItems } from "@vit/shared/types";
import { createSignal, onCleanup } from "solid-js";
import { playCartBurst } from "@/lib/cart-burst";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import { Button } from "../ui/button";

interface AddToCartButtonProps {
	cartItem: CartItems;
	compact?: boolean;
	openDrawer?: boolean;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center gap-2 transition-[opacity,filter,transform] duration-[430ms] ease-(--ease-playful-spring)";

const AddToCartButton = (props: AddToCartButtonProps) => {
	const [isAdded, setIsAdded] = createSignal(false);
	let resetTimer: number | undefined;
	let drawerTimer: number | undefined;

	onCleanup(() => {
		if (typeof window === "undefined") return;
		window.clearTimeout(resetTimer);
		window.clearTimeout(drawerTimer);
	});

	const handleAddToCart = (event: MouseEvent) => {
		const openDrawer = props.openDrawer ?? true;
		cart.add(props.cartItem, { openDrawer: false });
		setIsAdded(true);
		playCartBurst(event.currentTarget as HTMLElement);

		if (openDrawer) {
			drawerTimer = window.setTimeout(() => cart.openDrawer(), 520);
		}
		resetTimer = window.setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<Button
			class={cn(
				props.compact ? "" : "w-full",
				isAdded() &&
					"animate-cart-add-stamp bg-success text-success-foreground shadow-none",
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
						isAdded() && "-rotate-[100deg] scale-25 opacity-0 blur-[2px]",
					)}
					aria-hidden={isAdded()}
				>
					<IconShoppingCart class="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
					<span class="hidden text-[11px] sm:inline sm:text-xs">Сагслах</span>
				</span>
				<span
					class={cn(
						stateClass,
						!isAdded() && "rotate-[100deg] scale-25 opacity-0 blur-[2px]",
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
