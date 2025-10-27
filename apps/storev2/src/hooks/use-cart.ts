import { createEffect, createSignal, createMemo, onMount } from "solid-js";

export interface CartItems {
	productId: number;
	quantity: number;
	name: string;
	price: number;
	image: string;
}



// const getInitialCart = (): CartItems[] => {
// 	  if (typeof window === 'undefined') return [];
//   try {
//     const stored = localStorage.getItem("cart-items");
//     console.log("stored", stored);
//     return stored ? JSON.parse(stored) : [];
//   } catch {
//     return [];
//   }
// };

const useCart = () => {
	  const [cart, setCart] = createSignal<CartItems[]>([]);
	  const [mounted, setMounted] = createSignal(false);
	    onMount(() => {
    try {
      const stored = localStorage.getItem("cart-items");
      if (stored) {
        setCart(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load cart", error);
    } finally {
      setMounted(true);
    }
  });
	  createEffect(() => {
		if (typeof window !== 'undefined') {
			console.log("cart changed", cart());
			localStorage.setItem("cart-items", JSON.stringify(cart()));
		}
  });
  console.log("cart", cart(), "length", cart().length);
	const addToCart = (product: CartItems) => {
		console.log("adding product", product);
		const existingItem = cart().find(
			(item) => item.productId === product.productId,
		);

		if (existingItem) {
			setCart((prev) =>
				prev.map((item) =>
					item.productId === product.productId
						? {
								...item,
								quantity: Math.max(1, item.quantity + product.quantity),
							}
						: item,
				),
			);
		} else {
			setCart((prev) => [
				...prev,
				{ ...product, quantity: Math.max(1, product.quantity) },
			]);
		}
	};

	const removeFromCart = (productId: number, quantity?: number) => {
		if (quantity) {
			setCart((prev) =>
				prev.map((item) =>
					item.productId === productId
						? { ...item, quantity: Math.max(0, item.quantity - quantity) }
						: item,
				),
			);
		} else {
			setCart((prev) => prev.filter((item) => item.productId !== productId));
		}
	};
	const increaseQuantity = (productId: number) => {
		setCart((prev) =>
			prev.map((item) =>
				item.productId === productId
					? { ...item, quantity: item.quantity + 1 }
					: item,
			),
		);
	};
	const decreaseQuantity = (productId: number) => {
		setCart((prev) =>
			prev.map((item) =>
				item.productId === productId
					? { ...item, quantity: Math.max(0, item.quantity - 1) }
					: item,
			),
		);
	};
	const clearCart = () => {
		setCart([]);
	};

	const cartTotal = createMemo(() => 
  cart().reduce((acc, item) => acc + item.price * item.quantity, 0)
);

const cartCount = createMemo(() =>
  cart().reduce((acc, item) => acc + item.quantity, 0)
);
	return {
		cart,
		mounted,
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
