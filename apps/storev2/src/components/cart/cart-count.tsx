import { createSignal, onMount, Show } from "solid-js";
import { cart } from "@/store/cart";

const CartCount = () => {
	const [isHydrated, setIsHydrated] = createSignal(false);

	onMount(() => {
		setIsHydrated(true);
	});

	return (
		<Show when={isHydrated() && cart.count() > 0}>
			<span class="-top-1 -right-1 absolute flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-black bg-secondary font-bold text-secondary-foreground text-xs">
				<p class="font-bold text-xs">{cart.count()}</p>
			</span>
		</Show>
	);
};
export default CartCount;
