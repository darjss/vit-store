import { formatCurrency } from "@vit/shared";
import { LOW_STOCK_THRESHOLD } from "@vit/shared/domain/product";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/trpc";
import IconAlertTriangle from "~icons/ri/error-warning-fill";
import IconRefresh from "~icons/ri/refresh-line";

export interface InventorySnapshot {
	id: number;
	price: number;
	stock: number;
	status: string;
}

// Cached/SSR product data stays visible for discovery, but catalogue and PDP
// purchase controls require `verified` before they can add stock to the cart.
export type InventoryVerification =
	| { status: "checking"; lastVerifiedAt?: number }
	| { status: "verified"; verifiedAt: number }
	| { status: "degraded"; failedAt: number; lastVerifiedAt?: number };

type InventoryListener = (snapshot: InventorySnapshot) => void;
type VerificationListener = (state: InventoryVerification) => void;
type StoredSnapshot = {
	value: InventorySnapshot;
	fetchedAt: number;
};

const INVENTORY_SNAPSHOT_TTL_MS = 10_000;
const snapshots = new Map<number, StoredSnapshot>();
const listeners = new Map<number, Set<InventoryListener>>();
const verificationStates = new Map<number, InventoryVerification>();
const verificationListeners = new Map<number, Set<VerificationListener>>();

function lastVerifiedAt(productId: number): number | undefined {
	const current = verificationStates.get(productId);
	if (current?.status === "verified") return current.verifiedAt;
	return current?.lastVerifiedAt;
}

function publishVerification(
	productId: number,
	state: InventoryVerification,
): void {
	verificationStates.set(productId, state);
	for (const listener of verificationListeners.get(productId) ?? []) {
		listener(state);
	}
}

function markInventoryChecking(productId: number): void {
	publishVerification(productId, {
		status: "checking",
		lastVerifiedAt: lastVerifiedAt(productId),
	});
}

function markInventoryDegraded(productId: number): void {
	publishVerification(productId, {
		status: "degraded",
		failedAt: Date.now(),
		lastVerifiedAt: lastVerifiedAt(productId),
	});
}

function getFreshSnapshot(productId: number): InventorySnapshot | undefined {
	const stored = snapshots.get(productId);
	if (!stored) return;
	if (Date.now() - stored.fetchedAt >= INVENTORY_SNAPSHOT_TTL_MS) {
		snapshots.delete(productId);
		return;
	}
	return stored.value;
}

export function publishInventory(snapshot: InventorySnapshot): void {
	const fetchedAt = Date.now();
	snapshots.set(snapshot.id, { value: snapshot, fetchedAt });
	publishVerification(snapshot.id, {
		status: "verified",
		verifiedAt: fetchedAt,
	});
	for (const listener of listeners.get(snapshot.id) ?? []) {
		listener(snapshot);
	}
}

export function subscribeInventory(
	productId: number,
	listener: InventoryListener,
): () => void {
	const productListeners =
		listeners.get(productId) ?? new Set<InventoryListener>();
	productListeners.add(listener);
	listeners.set(productId, productListeners);

	const current = getFreshSnapshot(productId);
	if (current) listener(current);

	return () => {
		productListeners.delete(listener);
		if (productListeners.size === 0) listeners.delete(productId);
	};
}

export function useInventorySnapshot(productId: number) {
	const [snapshot, setSnapshot] = createSignal<InventorySnapshot>();
	onMount(() => {
		const unsubscribe = subscribeInventory(productId, setSnapshot);
		onCleanup(unsubscribe);
	});
	return snapshot;
}

export function useInventoryVerification(productId: number) {
	const [verification, setVerification] = createSignal<InventoryVerification>(
		verificationStates.get(productId) ?? { status: "checking" },
	);
	onMount(() => {
		const productListeners =
			verificationListeners.get(productId) ?? new Set<VerificationListener>();
		productListeners.add(setVerification);
		verificationListeners.set(productId, productListeners);

		const current = verificationStates.get(productId);
		if (current) setVerification(current);

		onCleanup(() => {
			productListeners.delete(setVerification);
			if (productListeners.size === 0) verificationListeners.delete(productId);
		});
	});
	return verification;
}

function setTextIfChanged(element: HTMLElement, value: string): void {
	if (element.textContent !== value) element.textContent = value;
}

function setHiddenIfChanged(element: HTMLElement, hidden: boolean): void {
	if (element.hidden !== hidden) element.hidden = hidden;
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
		const nextJsonLd = JSON.stringify(jsonLd);
		if (script.textContent !== nextJsonLd) script.textContent = nextJsonLd;
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

	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-price="${snapshot.id}"]`,
	)) {
		setTextIfChanged(element, formatCurrency(snapshot.price));
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-badge="${snapshot.id}"]`,
	)) {
		setTextIfChanged(element, stockLabel);
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-meta="${snapshot.id}"]`,
	)) {
		setHiddenIfChanged(element, !inStock);
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-low="${snapshot.id}"]`,
	)) {
		setHiddenIfChanged(element, !lowStock);
	}
	for (const element of document.querySelectorAll<HTMLElement>(
		`[data-inventory-stock-out="${snapshot.id}"]`,
	)) {
		setHiddenIfChanged(element, inStock);
	}
	updateJsonLd(snapshot, inStock);
}

function productIdsInSubtree(node: Node): number[] {
	if (!(node instanceof Element)) return [];
	const elements: Element[] = node.matches("[data-product-id]") ? [node] : [];
	elements.push(...node.querySelectorAll("[data-product-id]"));
	return elements
		.map((element) => Number(element.getAttribute("data-product-id")))
		.filter((productId) => Number.isInteger(productId) && productId > 0);
}

function productIdsInDocument(): number[] {
	return [...document.querySelectorAll("[data-product-id]")]
		.map((element) => Number(element.getAttribute("data-product-id")))
		.filter((productId) => Number.isInteger(productId) && productId > 0);
}

interface InventoryReconcilerProps {
	productIds: number[];
}

export default function InventoryReconciler(props: InventoryReconcilerProps) {
	const [degradedCount, setDegradedCount] = createSignal(0);
	let retryDegraded = () => {};

	onMount(() => {
		const pendingIds = new Set<number>();
		const degradedIds = new Set<number>();
		let flushTimer: number | undefined;
		let requestInFlight = false;
		let rerunAfterRequest = false;
		let disposed = false;

		const flush = async () => {
			if (requestInFlight) {
				rerunAfterRequest = true;
				return;
			}

			const productIds: number[] = [];
			for (const productId of pendingIds) {
				if (!Number.isInteger(productId) || productId <= 0) {
					pendingIds.delete(productId);
					continue;
				}
				const current = getFreshSnapshot(productId);
				if (current) {
					pendingIds.delete(productId);
					if (!disposed) reconcileDocument(current);
					continue;
				}
				if (productIds.length < 100) {
					pendingIds.delete(productId);
					productIds.push(productId);
				}
			}

			if (productIds.length === 0) return;

			requestInFlight = true;
			try {
				const inventory = await api.product.getInventory.query({ productIds });
				const receivedIds = new Set(inventory.map((snapshot) => snapshot.id));
				for (const snapshot of inventory) {
					degradedIds.delete(snapshot.id);
					publishInventory(snapshot);
					if (!disposed) reconcileDocument(snapshot);
				}
				for (const productId of productIds) {
					if (receivedIds.has(productId)) continue;
					degradedIds.add(productId);
					markInventoryDegraded(productId);
				}
				if (!disposed) setDegradedCount(degradedIds.size);
			} catch (error) {
				for (const productId of productIds) {
					degradedIds.add(productId);
					markInventoryDegraded(productId);
				}
				if (!disposed) setDegradedCount(degradedIds.size);
				console.warn("Inventory reconciliation failed", error);
			} finally {
				requestInFlight = false;
				if (rerunAfterRequest || pendingIds.size > 0) {
					rerunAfterRequest = false;
					void flush();
				}
			}
		};

		const scheduleFlush = (productIds: Iterable<number>) => {
			for (const productId of productIds) {
				pendingIds.add(productId);
				if (!getFreshSnapshot(productId)) markInventoryChecking(productId);
			}
			if (pendingIds.size === 0) return;
			if (flushTimer !== undefined) window.clearTimeout(flushTimer);
			flushTimer = window.setTimeout(() => {
				flushTimer = undefined;
				void flush();
			}, 0);
		};

		const observer = new MutationObserver((records) => {
			const addedProductIds = new Set<number>();
			for (const record of records) {
				for (const node of record.addedNodes) {
					for (const productId of productIdsInSubtree(node)) {
						addedProductIds.add(productId);
					}
				}
			}
			if (addedProductIds.size > 0) scheduleFlush(addedProductIds);
		});
		observer.observe(document.body, { childList: true, subtree: true });

		const refreshOnRouteChange = () => {
			const productIds = productIdsInDocument();
			for (const productId of productIds) snapshots.delete(productId);
			scheduleFlush(productIds);
		};
		retryDegraded = () => {
			const productIds = [...degradedIds];
			degradedIds.clear();
			setDegradedCount(0);
			for (const productId of productIds) snapshots.delete(productId);
			scheduleFlush(productIds);
		};
		document.addEventListener("astro:page-load", refreshOnRouteChange);
		scheduleFlush(props.productIds);

		onCleanup(() => {
			disposed = true;
			document.removeEventListener("astro:page-load", refreshOnRouteChange);
			observer.disconnect();
			if (flushTimer !== undefined) window.clearTimeout(flushTimer);
		});
	});

	return (
		<>
			<span hidden aria-hidden="true" data-inventory-reconciler />
			<Show when={degradedCount() > 0}>
				<div
					class="fixed inset-x-3 top-20 z-[60] mx-auto flex max-w-lg flex-wrap items-start gap-3 rounded-2xl border border-border bg-warning p-3 text-warning-foreground shadow-soft-lg sm:flex-nowrap sm:p-4"
					role="alert"
					data-inventory-warning
				>
					<IconAlertTriangle
						class="mt-0.5 h-5 w-5 shrink-0"
						aria-hidden="true"
					/>
					<div class="min-w-0 flex-1">
						<p class="font-semibold text-sm">Нөөцийг шинэчилж чадсангүй</p>
						<p class="mt-1 text-xs leading-relaxed sm:text-sm">
							Хуудсыг нээх үеийн мэдээлэл харагдаж байна. Одоогийн нөөц
							баталгаажаагүй тул сагслахыг түр зогсоолоо.
						</p>
					</div>
					<Button
						type="button"
						variant="secondary"
						size="compact"
						class="ml-8 basis-full sm:ml-0 sm:basis-auto"
						onClick={() => retryDegraded()}
					>
						<IconRefresh aria-hidden="true" />
						Дахин шалгах
					</Button>
				</div>
			</Show>
		</>
	);
}
