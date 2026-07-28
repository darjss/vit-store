import { onMount } from "solid-js";
import { clearCheckoutIdempotency } from "@/lib/checkout-idempotency";
import { cart } from "@/store/cart";

const ClearCart = () => {
	onMount(() => {
		cart.clearCart();
		clearCheckoutIdempotency();
	});

	return null;
};

export default ClearCart;
