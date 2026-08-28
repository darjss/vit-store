import { onMount } from "solid-js";
import { cart } from "@/store/cart";

const ClearCart = () => {
	onMount(() => {
		cart.clearCart();
	});

	return null;
};

export default ClearCart;
