import { formatCurrency } from "@vit/shared";
import { LOW_STOCK_THRESHOLD } from "@vit/shared/domain/product";
import { createSignal, onCleanup, onMount } from "solid-js";
import { api } from "@/lib/trpc";

export interface InventorySnapshot {
	id: number;
	price: number;
	stock: number;
	status: string;
}

type InventoryListener = (snapshot: InventorySnapshot) => void;

const snapshots = new Map<number, InventorySnapshot>();
const listeners = new Map<number, Set<InventoryListener>>();

export function publishInventory(snapshot: InventorySnapshot): void {
	snapshots.set(snapshot.id, snapshot);
	for (const listener of listeners.get(snapshot.id) ?? []) {
		listener(snapshot);
	}
}

export function subscribeInventory(
	productId: number,
	listener: InventoryListener,
): () => void {
	const productListeners = listeners.get(productId) ?? new Set<InventoryListener>();
	productListeners.add(listener);
	listeners.set(productId, productListeners);

	const current = snapshots.get(productId);
	if (current) listener(current);

	return () => {
		productListeners.delete(listener);
		if (productListeners.size === 0) listeners.delete(productId);
	};
}

export function useInventorySnapshot(productId: number) {
	const [snapshot, setSnapshot] = createSignal<InventorySnapshot>();
	onMount(() => subscribeInventory(productId, setSnapshot));
	return snapshot;
}

function updateJsonLd(snapshot: InventorySnapshot, inStock: boolean): void {
	const script = document.querySelector<HTMLScriptElement>(
		"script[data-product-jsonld]",
	);
	if (!script?.textContent) return;

	try {
		const jsonLd = JSON.parse(script.textContent) as {
			offers?: {
				price?: number;
				availability?: string;
			};
		};
		if (!jsonLd.offers) return;
		jsonLd.offers.price = snapshot.price;
		jsonLd.offers.availability = inStock
			? "https://schema.org/InStock"
			: "https://schema.org/OutOfStock";
		script.textContent = JSON.stringify(jsonLd);
	} catch {
		// A malformed optional JSON-LD block must not affect the purchase UI.
	}
}

function reconcileDocument(snapshot: InventorySnapshot): void {
	const inStock = snapshot.status === "active" && snapshot.stock > 0;
	const lowStock = inStock && snapshot.stock <= LOW_STOCK_THRESHOLD;
	const stockLabel = lowStock
		? `Цөөхөн үлдсэн (${snapshot.stock})`
		: inStock
			? "Бэлэн байна"
			: "Дууссан";
	const selector = `[data-inventory-price="${snapshot.id}"]`;

	for (const element of document.querySelectorAll<HTMLElement>(selector)) {
		element.textContent = formatCurrency(snapshot.price);
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-badge="${snapshot.id}"]`,
	)) {
		element.textContent = stockLabel;
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-meta="${snapshot.id}"]`,
	)) {
		element.hidden = !inStock;
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-low="${snapshot.id}"]`,
	)) {
		element.hidden = !lowStock;
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-out="${snapshot.id}"]`,
	)) {
		element.hidden = inStock;
	}
	updateJsonLd(snapshot, inStock);
}

interface InventoryReconcilerProps {
	productIds: number[];
}

export default function InventoryReconciler(
	props: InventoryReconcilerProps,
) {
	onMount(() => {
		const pendingIds = new Set(props.productIds);
		let flushTimer: number | undefined;
		let requestInFlight = false;
		let rerunAfterRequest = false;

		const flush = async () => {
			if (requestInFlight) {
				rerunAfterRequest = true;
				return;
			}

			for (const productId of pendingIds) {
				if (!Number.isInteger(productId) || productId <= 0) {
					pendingIds.delete(productId);
				}
			}

			const productIds = [...pendingIds]
				.filter((productId) => !snapshots.has(productId))
				.slice(0, 100);
			for (const productId of productIds) pendingIds.delete(productId);

			for (const productId of pendingIds) {
				const snapshot = snapshots.get(productId);
				if (snapshot) {
					pendingIds.delete(productId);
					reconcileDocument(snapshot);
				}
			}

			if (productIds.length === 0) return;

			requestInFlight = true;
			try {
				const inventory = await api.product.getInventory.query({ productIds });
				for (const snapshot of inventory) {
					publishInventory(snapshot);
					reconcileDocument(snapshot);
				}
			} catch (error) {
				console.warn("Inventory reconciliation failed", error);
			} finally {
				requestInFlight = false;
				if (rerunAfterRequest || pendingIds.size > 0) {
					rerunAfterRequest = false;
					void flush();
				}
			}
		};

		const scheduleFlush = () => {
			for (const element of document.querySelectorAll<HTMLElement>(
				"[data-product-id]",
			)) {
				const productId = Number(element.dataset.productId);
				if (Number.isInteger(productId) && productId > 0) {
					pendingIds.add(productId);
				}
			}

			if (flushTimer !== undefined) window.clearTimeout(flushTimer);
			flushTimer = window.setTimeout(() => {
				flushTimer = undefined;
				void flush();
			}, 0);
		};

		const observer = new MutationObserver(scheduleFlush);
		observer.observe(document.body, { childList: true, subtree: true });
		scheduleFlush();

		onCleanup(() => {
			observer.disconnect();
			if (flushTimer !== undefined) window.clearTimeout(flushTimer);
		});
	});

	return <span hidden aria-hidden="true" data-inventory-reconciler />;
}
