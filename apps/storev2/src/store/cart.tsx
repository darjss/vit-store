import { cookieStorage, makePersisted } from "@solid-primitives/storage";
import { createEffect, createMemo, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { isServer } from "solid-js/web";
import type { CartItems } from "@/lib/types";

const CART_LOCAL_STORAGE_KEY = "cart-items";
// const getCartFromLocalStorage = (): CartItems[] => {
// 	try {
// 		if (typeof window === "undefined") {
// 			return [];
// 		}
// 		const stored = localStorage.getItem(CART_LOCAL_STORAGE_KEY);
// 		if (stored) {
// 			const parsed = JSON.parse(stored) as CartItems[];
// 			if (!Array.isArray(parsed)) {
// 				return [];
// 			}
// 			return parsed;
// 		}
// 		return [];
// 	} catch (error) {
// 		console.error("Failed to load cart", error);
// 		return [];
// 	}
// };

export const cart=createRoot(() => {const [cartStore, setCart] = makePersisted(
	createStore<{ items: CartItems[] }>({
		items: [],
	}),
	{
		name: "cart-items",
		storage: localStorage,
		deferInit: true,
	},
);

const total = createMemo(() =>
	cartStore.items.reduce((acc, item) => acc + item.price * item.quantity, 0),
);

const count = createMemo(() =>
	cartStore.items.reduce((acc, item) => acc + item.quantity, 0),
);

	return {
	get items() {
		return cartStore.items;
	},

	add: (product: CartItems) => {
		console.log("product", product);
		const index = cartStore.items.findIndex(
			(item) => item.productId === product.productId,
		);

		if (index !== -1) {
			console.log("updating quantity", index, product.quantity);
			setCart("items", index, "quantity", (q) => q + 1);
		} else {
			setCart("items", cartStore.items.length, product);
		}
	},
	remove: (productId: number) => {
		setCart("items", (items) =>
			items.filter((item) => item.productId !== productId),
		);
	},
	updateQuantity: (productId: number, quantityChange: number) => {
		setCart(
			"items",
			(item) => item.productId === productId,
			"quantity",
			(quantity) => quantity + quantityChange,
		);
	},
	clearCart: () => setCart("items", []),

	get total() {
		return total();
	},
	get count() {
		return count();
	},
};
});
