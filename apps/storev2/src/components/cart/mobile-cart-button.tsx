import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import { createSignal, onMount, Show } from "solid-js";
import { cart } from "@/store/cart";
import { cartSheetFocusRestore } from "./cart-sheet-focus";

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
			aria-label="Сагс"
			class="group text-foreground/70 hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-[48px] w-full items-center justify-center rounded-full px-2 py-1.5 transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
			onClick={(event) => {
				cartSheetFocusRestore.register(event.currentTarget);
				cart.toggleDrawer();
			}}
			type="button"
		>
			<div class="flex flex-col items-center gap-1">
				<div class="relative">
					<IconShoppingCart aria-hidden="true" class="h-5 w-5" strokeWidth={2} />
					<Show when={isHydrated() && cart.count() > 0}>
						<span class="border-background bg-secondary text-secondary-foreground absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full border-2 px-0.5 text-[10px] font-bold tabular-nums">
							{cart.count()}
						</span>
					</Show>
				</div>
				<p class="text-[11px] leading-none font-semibold">Сагс</p>
			</div>
		</button>
	);
};

export default MobileCartButton;
