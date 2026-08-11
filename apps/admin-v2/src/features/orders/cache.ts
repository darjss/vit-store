/*
 * Orders — central cache helpers.
 *
 * Every write path goes through these so the list, the detail page, and any
 * cached search agree after a status change / delete / ship. Optimistic
 * updates snapshot the list caches and restore them on error (rollback).
 */
import type { QueryClient } from "@tanstack/solid-query";
import type { OrderStatusType } from "@vit/shared/types";

import { orderKeys } from "./queries";
import type { OrderDetailData, OrderListItem, OrderListData } from "./queries";

/** Replace one order everywhere it is cached (lists + detail). */
export function setOrderInCaches(
	queryClient: QueryClient,
	order: OrderListItem,
): void {
	queryClient.setQueriesData<OrderListData>(
		{ queryKey: orderKeys.lists() },
		(old) => {
			if (!old) return old;
			return {
				...old,
				orders: old.orders.map((item) => (item.id === order.id ? order : item)),
			};
		},
	);
	queryClient.setQueryData<OrderDetailData>(
		orderKeys.detail(order.id),
		(old) => {
			if (!old) return old;
			return { ...old, ...order };
		},
	);
}

/** Flip the status of one order everywhere (optimistic status change). */
export function setOrderStatusInCaches(
	queryClient: QueryClient,
	id: number,
	status: OrderStatusType,
): void {
	queryClient.setQueriesData<OrderListData>(
		{ queryKey: orderKeys.lists() },
		(old) => {
			if (!old) return old;
			return {
				...old,
				orders: old.orders.map((item) =>
					item.id === id ? { ...item, status } : item,
				),
			};
		},
	);
	queryClient.setQueryData<OrderDetailData>(orderKeys.detail(id), (old) => {
		if (!old) return old;
		return { ...old, status };
	});
}

/** Optimistic removal of an order from every cached list. */
export function removeOrderFromListCaches(
	queryClient: QueryClient,
	id: number,
): void {
	queryClient.setQueriesData<OrderListData>(
		{ queryKey: orderKeys.lists() },
		(old) => {
			if (!old) return old;
			return { ...old, orders: old.orders.filter((item) => item.id !== id) };
		},
	);
	queryClient.removeQueries({ queryKey: orderKeys.detail(id) });
}

export interface OrderListsSnapshot {
	entries: Array<{ key: readonly unknown[]; data: unknown }>;
}

/** Snapshot every cached list (delete rollback source). */
export function snapshotOrderLists(
	queryClient: QueryClient,
): OrderListsSnapshot {
	const entries = queryClient
		.getQueriesData({ queryKey: orderKeys.lists() })
		.map(([key, data]) => ({ key, data }));
	return { entries };
}

/** Restore a snapshot taken before an optimistic write. */
export function restoreOrderLists(
	queryClient: QueryClient,
	snapshot: OrderListsSnapshot,
): void {
	for (const { key, data } of snapshot.entries) {
		queryClient.setQueryData(key, data);
	}
}

/** Background refetch of lists (and the detail when given) after a write. */
export function invalidateOrderCaches(
	queryClient: QueryClient,
	id?: number,
): void {
	void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
	if (id !== undefined) {
		void queryClient.invalidateQueries({ queryKey: orderKeys.detail(id) });
	}
}
