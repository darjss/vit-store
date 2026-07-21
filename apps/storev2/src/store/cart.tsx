import { makePersisted } from "@solid-primitives/storage";
import type { CartItems } from "@vit/shared/types";
import {
	createEffect,
	createMemo,
	createRoot,
	createSignal,
	type Accessor,
} from "solid-js";
import { createStore } from "solid-js/store";
import { onMount } from "solid-js";
import {
	trackAddToCart,
	trackCartOpened,
	trackRemoveFromCart,
} from "@/lib/analytics";
import { safeStorage } from "@/lib/safe-storage";

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

	// `onMount` does not fire inside a detached `createRoot` (no component
	// lifecycle), so the cart page gated on `isHydrated()` would stay on the
	// loading skeleton forever. `createEffect` runs in a detached root and is
	// a no-op during SSR, matching the intended client-only hydration signal.
	createEffect(() => {
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

	const isEmpty = createMemo(() => cartStore.items.length === 0);

	// Canonical "loading / empty / ready" derivation. Astro islands cannot
	// rely on the detached-root `isHydrated()` signal (it does not reliably
	// fire inside islands), so `createCartState()` below mirrors the proven
	// local-`onMount` pattern and feeds this same derivation.
	const state = createMemo<"loading" | "empty" | "ready">(() => {
		if (!isHydrated()) return "loading";
		return isEmpty() ? "empty" : "ready";
	});

	return {
		items() {
			return cartStore.items;
		},
		isHydrated() {
			return isHydrated();
		},
		isEmpty() {
			return isEmpty();
		},
		state() {
			return state();
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
		// Canonical quantity policy: floor at 1. Call sites (cart page,
		// drawer) just call updateQuantity(id, ±1) without re-implementing
		// the decrement-or-remove decision. Explicit removal uses `remove`.
		updateQuantity: (productId: number, quantityChange: number) => {
			setCart(
				"items",
				(item) => item.productId === productId,
				"quantity",
				(quantity) => {
					const next = quantity + quantityChange;
					return next < 1 ? 1 : next;
				},
			);
		},
		clearCart: () => setCart("items", []),

		total,
		count,
	};
});

export type CartState = "loading" | "empty" | "ready";

/**
 * Per-island canonical cart state derivation. Astro islands cannot rely on
 * the store's detached-root `isHydrated()` signal, so each island flips a
 * local `onMount` flag and this helper folds it together with `cart.items()`
 * into the single "loading / empty / ready" state used by every cart-gated
 * page. Replaces the divergent `isHydrated && isEmpty` re-derivations.
 */
export function createCartState(): Accessor<CartState> {
	const [hydrated, setHydrated] = createSignal(false);
	onMount(() => setHydrated(true));
	return createMemo<CartState>(() => {
		if (!hydrated()) return "loading";
		return cart.items().length === 0 ? "empty" : "ready";
	});
}
