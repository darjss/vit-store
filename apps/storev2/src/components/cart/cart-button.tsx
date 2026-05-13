import { cart } from "@/store/cart";
import IconShoppingCart from "~icons/ri/shopping-cart-2-line";
import CartCount from "./cart-count";

const CartButton = () => {
	return (
		<button
			type="button"
			onClick={() => cart.toggleDrawer()}
			aria-label="Сагс"
			class="relative flex items-center justify-center border-[3px] border-border bg-background p-2 shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:bg-primary hover:shadow-none"
		>
			<IconShoppingCart class="h-5 w-5" aria-hidden="true" />

			<CartCount />
		</button>
	);
};

export default CartButton;
