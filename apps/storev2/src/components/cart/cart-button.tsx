import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import { cart } from "@/store/cart";
import CartCount from "./cart-count";
import { cartSheetFocusRestore } from "./cart-sheet-focus";

const CartButton = () => {
	return (
		<button
			aria-label="Сагс"
			class="border-border bg-card shadow-soft-sm hover:bg-primary hover:shadow-soft focus-visible:ring-ring focus-visible:ring-offset-background relative flex size-11 items-center justify-center rounded-full border transition-[transform,box-shadow,background-color] duration-[140ms] ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.97]"
			onClick={(event) => {
				cartSheetFocusRestore.register(event.currentTarget);
				cart.toggleDrawer();
			}}
			type="button"
		>
			<IconShoppingCart aria-hidden="true" class="h-5 w-5" strokeWidth={2} />

			<CartCount />
		</button>
	);
};

export default CartButton;
