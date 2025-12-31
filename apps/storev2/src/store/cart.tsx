import { makePersisted } from "@solid-primitives/storage";
import { createMemo, createRoot, createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import {
	trackAddToCart,
	trackCartOpened,
	trackRemoveFromCart,
} from "@/lib/analytics";
import type { CartItems } from "@/lib/types";

// Safe storage wrapper that handles SSR
const safeStorage: Storage = {
	getItem: (key: string) => {
		if (typeof window === "undefined") {
			return null;
		}
		try {
			return localStorage.getItem(key);
		} catch {
			return null;
		}
	},
	setItem: (key: string, value: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.setItem(key, value);
		} catch {
			// Ignore storage errors
		}
	},
	removeItem: (key: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {
			// Ignore storage errors
		}
	},
	clear: () => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.clear();
		} catch {
			// Ignore storage errors
		}
	},
	get length() {
		if (typeof window === "undefined") {
			return 0;
		}
		try {
			return localStorage.length;
		} catch {
			return 0;
		}
	},
	key: (index: number) => {
		if (typeof window === "undefined") {
			return null;
		}
		try {
			return localStorage.key(index);
		} catch {
			return null;
		}
	},
};

export const cart = createRoot(() => {
	const [isHydrated, setIsHydrated] = createSignal(false);
	const [isDrawerOpen, setIsDrawerOpen] = createSignal(false);

	const [cartStore, setCart] = makePersisted(
		createStore<{ items: CartItems[] }>({
			items: [],
		}),
		{
			name: "cart-items",
			storage: safeStorage,
			deferInit: true,
		},
	);

	onMount(() => {
		queueMicrotask(() => {
			setIsHydrated(true);
		});
	});

	const total = createMemo(() =>
		cartStore.items.reduce((acc, item) => acc + item.price * item.quantity, 0),
	);

	const count = createMemo(() =>
		cartStore.items.reduce((acc, item) => acc + item.quantity, 0),
	);

	return {
		items() {
			return cartStore.items;
		},
		isHydrated() {
			return isHydrated();
		},
		isDrawerOpen() {
			return isDrawerOpen();
		},
		openDrawer: () => {
			trackCartOpened(count(), total());
			setIsDrawerOpen(true);
		},
		closeDrawer: () => setIsDrawerOpen(false),
		toggleDrawer: () => setIsDrawerOpen((prev) => !prev),

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

			// Track add to cart event
			trackAddToCart({
				product_id: product.productId,
				product_name: product.name,
				price: product.price,
				quantity: product.quantity,
			});

			// Open drawer after adding item
			setIsDrawerOpen(true);
		},
		remove: (productId: number) => {
			trackRemoveFromCart(productId);
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

		total,
		count,
	};
});
