import { Show } from "solid-js";
import useCart from "@/hooks/use-cart";

const CartCount = () => {
	const { cartCount, mounted } = useCart();
	return (
		<Show when={mounted()} fallback={<span class="opacity-0">0</span>}>
			<p class="font-bold text-xs">{cartCount()}</p>
		</Show>
	);
};
export default CartCount;
