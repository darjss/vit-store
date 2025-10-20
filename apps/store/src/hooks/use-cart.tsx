import { computed, effect, signal } from "@preact/signals";

export interface CartItems {
	productId: number;
	quantity: number;
	name: string;
	price: number;
	image: string;
}

const useCart = () => {
	const cart = signal<CartItems[]>([]);
	
	let previousCart = JSON.stringify(cart.value);
	effect(() => {
		const currentCart = JSON.stringify(cart.value);
		if (currentCart !== previousCart) {
			localStorage.setItem("cartItems", currentCart);
			previousCart = currentCart;
		}
	});
	const addToCart = (product: CartItems) => {
		cart.value = cart.value.map((item) =>
			item.productId === product.productId
				? { ...item, quantity: item.quantity + product.quantity }
				: item,
		);
		cart.value = [...cart.value, product];
	};
	const removeFromCart = (productId: number) => {
		cart.value = cart.value.filter((item) => item.productId !== productId);
	};
	const clearCart = () => {
		cart.value = [];
	};
	const cartTotal = computed(() =>
		cart.value.reduce((acc, item) => acc + item.price * item.quantity, 0),
	);

	const cartCount = computed(() =>
		cart.value.reduce((acc, item) => acc + item.quantity, 0),
	);
	return [cart, addToCart, removeFromCart, clearCart, cartTotal, cartCount];
};
export default useCart;
