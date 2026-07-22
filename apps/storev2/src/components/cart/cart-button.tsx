import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import { cart } from "@/store/cart";
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
			class="relative flex size-11 items-center justify-center rounded-full border border-border bg-card shadow-soft-sm transition-[transform,box-shadow,background-color] duration-[140ms] ease-out hover:bg-primary hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
		>
			<IconShoppingCart class="h-5 w-5" strokeWidth={2} aria-hidden="true" />

			<CartCount />
		</button>
	);
};

export default CartButton;
