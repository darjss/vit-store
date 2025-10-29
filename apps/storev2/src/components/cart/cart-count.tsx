import { Show, createSignal, onMount} from "solid-js";
import { cart } from "@/store/cart";

const CartCount = () => {
	const [isMounted, setIsMounted] = createSignal(false)
	onMount(() => setIsMounted(true))
	return (
		<Show when={isMounted() && cart.count !== 0} fallback={<div class="opacity-0"></div>}>
			                        <span
                            class="absolute -top-1 -right-1 bg-secondary text-secondary-foreground w-5 h-5 rounded-full text-xs flex items-center justify-center border-[3px] border-black font-bold"
                        >
			<p class="font-bold text-xs">{cart.count}</p>
			                        </span>

		</Show>
	);
};
export default CartCount;
