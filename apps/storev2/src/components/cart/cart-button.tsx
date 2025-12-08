import { cart } from "@/store/cart";
import CartCount from "./cart-count";
import IconShoppingCart from "~icons/ri/shopping-cart-2-line";

const CartButton = () => {
	return (
		<button
			type="button"
			onClick={() => cart.toggleDrawer()}
			aria-label="Сагс"
			class="relative flex items-center justify-center border-[3px] border-black bg-white p-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-px hover:translate-y-px hover:bg-primary hover:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
		>
			<IconShoppingCart class="h-5 w-5" aria-hidden="true" />

			<CartCount />
		</button>
	);
};

export default CartButton;
