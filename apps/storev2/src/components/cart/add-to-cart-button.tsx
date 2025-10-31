import type { CartItems } from "@/lib/types";
import { cart } from "@/store/cart";
import { Button } from "../ui/button";

const AddToCartButton = ({ cartItem }: { cartItem: CartItems }) => {
	return (
		<Button
			class="w-full flex items-center justify-center gap-2 rounded-sm border-3 sm:border-4 border-black bg-primary px-6 py-3 font-black text-sm sm:text-base uppercase tracking-tight shadow-[4px_4px_0_0_#000] sm:shadow-[5px_5px_0_0_#000] transition-all duration-200 hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary/90 hover:shadow-[2px_2px_0_0_#000] sm:hover:shadow-[3px_3px_0_0_#000] active:scale-[0.98] touch-manipulation"
			type={"button"}
			onClick={() => cart.add(cartItem)}
		>
			<span class="text-lg sm:text-xl">🛒</span>
			<span>Add to Cart</span>
		</Button>
	);
};

export default AddToCartButton;
