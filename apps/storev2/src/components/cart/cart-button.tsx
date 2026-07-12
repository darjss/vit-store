import { cart } from "@/store/cart";
import IconShoppingCart from "~icons/ri/shopping-cart-2-line";
import CartCount from "./cart-count";
import { cartSheetFocusRestore } from "./cart-sheet-focus";

const CartButton = () => {
	return (
		<button
			type="button"
			onClick={(event) => {
				cartSheetFocusRestore.register(event.currentTarget);
				cart.toggleDrawer();
			}}
			aria-label="Сагс"
			class="relative flex size-11 items-center justify-center rounded-full border border-border bg-card shadow-soft-sm transition-[transform,box-shadow,background-color] duration-[140ms] ease-out hover:bg-primary hover:shadow-soft active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
		>
			<IconShoppingCart class="h-5 w-5" aria-hidden="true" />

			<CartCount />
		</button>
	);
};

export default CartButton;
