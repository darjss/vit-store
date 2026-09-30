import { CheckCircleIcon as IconCheck } from "@solar-icons/solid/bold";
import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import type { CartItems } from "@vit/shared/types";
import { createSignal, onCleanup } from "solid-js";
import { isServer } from "@/lib/runtime";
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
		if (isServer) {
			return;
		}
		window.clearTimeout(resetTimer);
		window.clearTimeout(drawerTimer);
	});

	const handleAddToCart = (event: MouseEvent) => {
		const openDrawer = props.openDrawer ?? true;
		cart.add(props.cartItem, { openDrawer: false });
		setIsAdded(true);
		const target = event.currentTarget;
		if (target && "style" in target) {
			// SAFETY: click target with CSSOM style is the button HTMLElement.
			playCartBurst(target as HTMLElement);
		}

		if (openDrawer) {
			drawerTimer = window.setTimeout(() => cart.openDrawer(), 520);
		}
		resetTimer = window.setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<Button
			aria-label="Сагслах"
			class={cn(
				props.compact ? "" : "w-full",
				isAdded() && "animate-cart-add-stamp bg-success text-success-foreground shadow-none",
			)}
			disabled={isAdded()}
			onClick={handleAddToCart}
			size={props.compact ? "compact" : "default"}
			type="button"
			variant="default"
		>
			<span class="grid place-items-center">
				<span
					aria-hidden={isAdded()}
					class={cn(stateClass, isAdded() && "scale-25 -rotate-[100deg] opacity-0 blur-[2px]")}
				>
					<IconShoppingCart class="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2} />
					<span class="hidden text-[11px] sm:inline sm:text-xs">Сагслах</span>
				</span>
				<span
					aria-hidden={!isAdded()}
					class={cn(stateClass, !isAdded() && "scale-25 rotate-[100deg] opacity-0 blur-[2px]")}
				>
					<IconCheck class="h-4 w-4 sm:h-5 sm:w-5" />
					<span class="hidden text-[11px] sm:inline sm:text-xs">Нэмэгдлээ!</span>
				</span>
			</span>
		</Button>
	);
};

export default AddToCartButton;
