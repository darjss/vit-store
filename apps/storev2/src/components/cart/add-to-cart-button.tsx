import type { CartItems } from "@/lib/types";
import { cart } from "@/store/cart";
import { Button } from "../ui/button";

interface AddToCartButtonProps {
	cartItem: CartItems;
	compact?: boolean;
}

const AddToCartButton = (props: AddToCartButtonProps) => {
	const baseClasses =
		"flex touch-manipulation items-center justify-center gap-2 rounded-sm border-3 border-black bg-primary font-black uppercase tracking-tight shadow-[4px_4px_0_0_#000] transition-all duration-200 hover:translate-x-px hover:translate-y-px hover:bg-primary/90 hover:shadow-[2px_2px_0_0_#000] active:scale-[0.98] sm:border-4 sm:shadow-[5px_5px_0_0_#000] sm:hover:shadow-[3px_3px_0_0_#000]";
	const sizeClasses = props.compact
		? "w-auto px-3 py-2 text-[10px] sm:px-4 sm:py-2 sm:text-xs"
		: "w-full px-6 py-3 text-sm sm:text-base";

	return (
		<Button
			class={`${baseClasses} ${sizeClasses}`}
			type="button"
			onClick={() => cart.add(props.cartItem)}
		>
			<span class="text-base sm:text-lg">🛒</span>
			<span class="hidden text-[10px] sm:inline sm:text-xs">Сагслах</span>
		</Button>
	);
};

export default AddToCartButton;
