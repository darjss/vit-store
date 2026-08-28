import { onMount } from "solid-js";
import { clearActivePayment } from "@/lib/active-payment";
import { cart } from "@/store/cart";

const ClearCart = () => {
	onMount(() => {
		cart.clearCart();
		clearActivePayment();
	});

	return null;
};

export default ClearCart;
