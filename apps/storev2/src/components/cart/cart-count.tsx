import { Show } from "solid-js";
import { cart } from "@/store/cart";

const CartCount = () => {
	return (
		<Show when={cart.count !== 0}>
			<span class="-top-1 -right-1 absolute flex h-5 w-5 items-center justify-center rounded-full border-[3px] border-black bg-secondary font-bold text-secondary-foreground text-xs">
				<p class="font-bold text-xs">{cart.count}</p>
			</span>
		</Show>
	);
};
export default CartCount;
