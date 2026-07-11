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

// Cached/SSR product data stays visible for discovery, but every stock-sensitive
// purchase control requires `verified` before it can add stock to the cart.
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
const registrationCounts = new Map<number, number>();
const requestGenerations = new Map<number, number>();
const pendingRequests = new Map<number, number>();
const warningListeners = new Set<(count: number) => void>();
const activeRequests = new Set<{
	controller: AbortController;
	entries: Map<number, number>;
}>();
let flushTimer: number | undefined;

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
	notifyWarningListeners();
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

function publishInventory(snapshot: InventorySnapshot): void {
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

// This hook is the canonical registration API: every verification consumer is
// enrolled in the shared request coordinator and removed again on cleanup.
export function useInventoryVerification(productId: number) {
	const [verification, setVerification] = createSignal<InventoryVerification>(
		verificationStates.get(productId) ?? { status: "checking" },
	);
	onMount(() => {
		const productListeners =
			verificationListeners.get(productId) ?? new Set<VerificationListener>();
		productListeners.add(setVerification);
		verificationListeners.set(productId, productListeners);
		const unregister = registerInventoryProduct(productId);

		const current = verificationStates.get(productId);
		if (current) setVerification(current);

		onCleanup(() => {
			unregister();
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

function degradedRegistrationCount(): number {
	let count = 0;
	for (const [productId, registrations] of registrationCounts) {
		if (
			registrations > 0 &&
			verificationStates.get(productId)?.status === "degraded"
		) {
			count += 1;
		}
	}
	return count;
}

function notifyWarningListeners(): void {
	const count = degradedRegistrationCount();
	for (const listener of warningListeners) listener(count);
}

function isCurrentRequest(productId: number, generation: number): boolean {
	return (
		(registrationCounts.get(productId) ?? 0) > 0 &&
		requestGenerations.get(productId) === generation
	);
}

function scheduleQueueFlush(): void {
	if (flushTimer !== undefined) return;
	flushTimer = window.setTimeout(() => {
		flushTimer = undefined;
		void flushInventoryQueue();
	}, 0);
}

function queueInventoryRequest(productId: number): void {
	const generation = (requestGenerations.get(productId) ?? 0) + 1;
	requestGenerations.set(productId, generation);
	pendingRequests.set(productId, generation);
	markInventoryChecking(productId);
	scheduleQueueFlush();
}

function publishCurrentSnapshots(
	entries: Map<number, number>,
	inventory: InventorySnapshot[],
): Set<number> {
	const receivedIds = new Set<number>();
	for (const snapshot of inventory) {
		const generation = entries.get(snapshot.id);
		if (
			generation === undefined ||
			!isCurrentRequest(snapshot.id, generation)
		) {
			continue;
		}
		receivedIds.add(snapshot.id);
		publishInventory(snapshot);
		reconcileDocument(snapshot);
	}
	return receivedIds;
}

function markMissingSnapshotsDegraded(
	entries: Map<number, number>,
	receivedIds: Set<number>,
): void {
	for (const [productId, generation] of entries) {
		if (
			!receivedIds.has(productId) &&
			isCurrentRequest(productId, generation)
		) {
			markInventoryDegraded(productId);
		}
	}
}

function markCurrentEntriesDegraded(entries: Map<number, number>): void {
	for (const [productId, generation] of entries) {
		if (isCurrentRequest(productId, generation)) {
			markInventoryDegraded(productId);
		}
	}
}

async function flushInventoryQueue(): Promise<void> {
	const entries = new Map([...pendingRequests].slice(0, 100));
	for (const productId of entries.keys()) pendingRequests.delete(productId);
	if (entries.size === 0) return;

	const controller = new AbortController();
	const request = { controller, entries };
	activeRequests.add(request);

	try {
		const inventory = await api.product.getInventory.query(
			{ productIds: [...entries.keys()] },
			{ signal: controller.signal },
		);
		const receivedIds = publishCurrentSnapshots(entries, inventory);
		markMissingSnapshotsDegraded(entries, receivedIds);
	} catch (error) {
		if (!controller.signal.aborted) {
			markCurrentEntriesDegraded(entries);
			console.warn("Inventory reconciliation failed", error);
		}
	} finally {
		activeRequests.delete(request);
		if (pendingRequests.size > 0) scheduleQueueFlush();
	}
}

function registerInventoryProduct(productId: number): () => void {
	if (!Number.isInteger(productId) || productId <= 0) return () => {};

	const registrations = registrationCounts.get(productId) ?? 0;
	registrationCounts.set(productId, registrations + 1);
	if (registrations === 0) {
		const current = getFreshSnapshot(productId);
		if (current && verificationStates.get(productId)?.status === "verified") {
			reconcileDocument(current);
			notifyWarningListeners();
		} else {
			queueInventoryRequest(productId);
		}
	}

	return () => {
		const nextCount = (registrationCounts.get(productId) ?? 1) - 1;
		if (nextCount > 0) {
			registrationCounts.set(productId, nextCount);
			return;
		}

		registrationCounts.delete(productId);
		pendingRequests.delete(productId);
		requestGenerations.set(
			productId,
			(requestGenerations.get(productId) ?? 0) + 1,
		);
		for (const request of activeRequests) {
			const hasRegisteredProduct = [...request.entries.keys()].some(
				(id) => (registrationCounts.get(id) ?? 0) > 0,
			);
			if (!hasRegisteredProduct) request.controller.abort();
		}
		notifyWarningListeners();
	};
}

function retryDegradedInventory(): void {
	for (const [productId, registrations] of registrationCounts) {
		if (
			registrations > 0 &&
			verificationStates.get(productId)?.status === "degraded"
		) {
			snapshots.delete(productId);
			queueInventoryRequest(productId);
		}
	}
}

export default function InventoryReconciler() {
	const [degradedCount, setDegradedCount] = createSignal(
		degradedRegistrationCount(),
	);

	onMount(() => {
		warningListeners.add(setDegradedCount);
		setDegradedCount(degradedRegistrationCount());
		onCleanup(() => warningListeners.delete(setDegradedCount));
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
						onClick={retryDegradedInventory}
					>
						<IconRefresh aria-hidden="true" />
						Дахин шалгах
					</Button>
				</div>
			</Show>
		</>
	);
}
