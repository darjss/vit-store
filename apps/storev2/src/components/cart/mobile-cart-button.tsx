import { createSignal, onMount, Show } from "solid-js";
import { cart } from "@/store/cart";
import IconShoppingCart from "~icons/ri/shopping-cart-2-line";

/**
 * Mobile-optimized cart button that opens the cart drawer.
 * Designed for the mobile bottom navigation bar.
 */
const MobileCartButton = () => {
	const [isHydrated, setIsHydrated] = createSignal(false);

	onMount(() => {
		setIsHydrated(true);
	});

	return (
		<button
			type="button"
			onClick={() => cart.toggleDrawer()}
			class="group flex w-full min-h-[48px] items-center justify-center rounded-full px-2 py-1.5 text-foreground/70 transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			aria-label="Сагс"
		>
			<div class="flex flex-col items-center gap-1">
				<div class="relative">
					<IconShoppingCart class="h-5 w-5" aria-hidden="true" />
					<Show when={isHydrated() && cart.count() > 0}>
						<span class="-top-2 -right-2 absolute flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-background bg-secondary px-0.5 font-bold text-[10px] text-secondary-foreground tabular-nums">
							{cart.count()}
						</span>
					</Show>
				</div>
				<p class="font-semibold text-[11px] leading-none">Сагс</p>
			</div>
		</button>
	);
};

export default MobileCartButton;
