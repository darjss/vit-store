import { computed, effect, signal } from "@preact/signals";

export interface CartItems {
	productId: number;
	quantity: number;
	name: string;
	price: number;
	image: string;
}

const getInitialCart = (): CartItems[] => {
	try {
		const stored = localStorage.getItem("cartItems");
		return stored ? JSON.parse(stored) : [];
	} catch {
		return [];
	}
};

const cart = signal<CartItems[]>(getInitialCart());

const useCart = () => {
	// Targeted effect - only write when cart actually changes
	let previousCart = JSON.stringify(cart.value);
	effect(() => {
		const currentCart = JSON.stringify(cart.value);
		if (currentCart !== previousCart) {
			try {
				localStorage.setItem("cartItems", currentCart);
				previousCart = currentCart;
			} catch (error) {
				console.error("Failed to save cart to localStorage:", error);
			}
		}
	});

	const addToCart = (product: CartItems) => {
		const existingItem = cart.value.find(
			(item) => item.productId === product.productId,
		);

		if (existingItem) {
			// Update existing item quantity
			cart.value = cart.value.map((item) =>
				item.productId === product.productId
					? { ...item, quantity: Math.max(1, item.quantity + product.quantity) }
					: item,
			);
		} else {
			cart.value = [
				...cart.value,
				{ ...product, quantity: Math.max(1, product.quantity) },
			];
		}
	};

	const removeFromCart = (productId: number, quantity?: number) => {
		if (quantity) {
			cart.value = cart.value.map((item) =>
				item.productId === productId
					? { ...item, quantity: Math.max(0, item.quantity - quantity) }
					: item,
			);
		} else {
			cart.value = cart.value.filter((item) => item.productId !== productId);
		}
	};
	const increaseQuantity = (productId: number) => {
		cart.value = cart.value.map((item) =>
			item.productId === productId ? { ...item, quantity: item.quantity + 1 } : item,
		);
	};
	const decreaseQuantity = (productId: number) => {
		cart.value = cart.value.map((item) =>
			item.productId === productId ? { ...item, quantity: item.quantity - 1 } : item,
		);
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

	return {
		cart,
		addToCart,
		removeFromCart,
		clearCart,
		cartTotal,
		cartCount,
		increaseQuantity,
		decreaseQuantity,
	} as const;
};

export default useCart;
