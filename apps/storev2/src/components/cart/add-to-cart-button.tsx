import type { CartItems } from "@/lib/types";
import { cart } from "@/store/cart";
import { Button } from "../ui/button";

const AddToCartButton = ({ cartItem }: { cartItem: CartItems }) => {
	return (
		<Button
			class="absolute right-3 bottom-3 flex items-center gap-1 rounded-sm border-2 border-black bg-primary px-2 py-1.5 font-black text-[10px] uppercase shadow-[2px_2px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-primary/90 hover:shadow-[1px_1px_0_0_#000] active:scale-95 sm:right-5 sm:bottom-5 sm:px-3 sm:py-2 sm:text-xs"
			type={"button"}
			onClick={() => cart.add(cartItem)}
		>
			<span>🛒</span>
			<span class="hidden sm:inline">Add to Cart</span>
			<span class="sm:hidden">Add</span>
		</Button>
	);
};

export default AddToCartButton;
