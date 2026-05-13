import { makePersisted } from "@solid-primitives/storage";
import type { CartItems } from "@vit/shared/types";
import { createMemo, createRoot, createSignal, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import {
	trackAddToCart,
	trackCartOpened,
	trackRemoveFromCart,
} from "@/lib/analytics";

/**
 * Announce a message to screen readers via the live region.
 * Safe to call from any cart operation.
 */
function announceCart(message: string) {
	if (typeof document !== "undefined") {
		const region = document.getElementById("cart-live-region");
		if (region) {
			region.textContent = message;
			// Clear after announcement to avoid stale text
			setTimeout(() => {
				if (region.textContent === message) {
					region.textContent = "";
				}
			}, 2000);
		}
	}
}

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
		} catch {}
	},
	removeItem: (key: string) => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.removeItem(key);
		} catch {}
	},
	clear: () => {
		if (typeof window === "undefined") {
			return;
		}
		try {
			localStorage.clear();
		} catch {}
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

		add: (product: CartItems, options?: { openDrawer?: boolean }) => {
			const index = cartStore.items.findIndex(
				(item) => item.productId === product.productId,
			);

			if (index !== -1) {
				setCart("items", index, "quantity", (q) => q + 1);
				announceCart(`${product.name} сагсанд нэмэгдлээ`);
			} else {
				setCart("items", cartStore.items.length, product);
				announceCart(`${product.name} сагсанд нэмэгдлээ`);
			}

			trackAddToCart({
				product_id: product.productId,
				product_name: product.name,
				price: product.price,
				quantity: product.quantity,
			});

			if (options?.openDrawer !== false) {
				setIsDrawerOpen(true);
			}
		},
		remove: (productId: number) => {
			const item = cartStore.items.find((i) => i.productId === productId);
			trackRemoveFromCart(productId);
			setCart("items", (items) =>
				items.filter((item) => item.productId !== productId),
			);
			if (item) {
				announceCart(`${item.name} сагснаас хасагдлаа`);
			}
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
