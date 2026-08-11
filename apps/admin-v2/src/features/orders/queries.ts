/*
 * Orders — query modules (TanStack Solid Query).
 *
 * Conventions (from plans/admin-v1-solid-rewrite.md + store-kit):
 * - hierarchical query keys under ["orders", ...]
 * - components call query options; they never define request functions
 * - the typed tRPC client (`api` from @/lib/trpc) is the only transport
 *
 * Cache rules (plans/admin-v2-contracts.md §3): order reads are NEVER served
 * from Workers Cache (pending orders, order detail, order status must stay
 * fresh). The server side already honours this; on the client the list query
 * carries a modest refetch interval (like the legacy admin) so the pending
 * work queue stays current. Do not lift these queries onto any KV cache.
 */
import { queryOptions } from "@tanstack/solid-query";

import { api } from "@/lib/trpc";

/**
 * Exact input/output shapes straight from @vit/api (the typed client). These
 * stay in sync with the router automatically — never hand-write a mirror.
 */
export type OrderListInput = Parameters<
	typeof api.order.getPaginatedOrders.query
>[0];
export type OrderListData = Awaited<
	ReturnType<typeof api.order.getPaginatedOrders.query>
>;
export type OrderListItem = OrderListData["orders"][number];
export type OrderDetailData = Awaited<
	ReturnType<typeof api.order.getOrderById.query>
>;
export type DeliveryZone = Awaited<
	ReturnType<typeof api.order.getDeliveryAddressZones.query>
>[number];
export type OrderLineProduct = Awaited<
	ReturnType<typeof api.product.searchProductsInstant.query>
>[number];

const ordersRoot = ["orders"] as const;

export const orderKeys = {
	all: ordersRoot,
	lists: () => [...ordersRoot, "list"] as const,
	list: (filters: OrderListInput) => [...ordersRoot, "list", filters] as const,
	details: () => [...ordersRoot, "detail"] as const,
	detail: (id: number) => [...ordersRoot, "detail", id] as const,
	byNumber: (orderNumber: string) =>
		[...ordersRoot, "by-number", orderNumber] as const,
	zones: [...ordersRoot, "delivery-zones"] as const,
	productSearch: (query: string) =>
		["products", "instant-search", query] as const,
} as const;

/**
 * Paginated order list. The `filters` object is the normalized API input
 * (only defined keys included, so query keys stay canonical per filter set).
 * Refetches every 15s while mounted — the legacy admin behaviour — so the
 * pending/active queue never goes stale (pending orders are never cached).
 */
export const orderListQueryOptions = (filters: OrderListInput) =>
	queryOptions({
		queryKey: orderKeys.list(filters),
		queryFn: () => api.order.getPaginatedOrders.query(filters),
		refetchInterval: 15_000,
	});

export const orderDetailQueryOptions = (id: number) =>
	queryOptions({
		queryKey: orderKeys.detail(id),
		queryFn: () => api.order.getOrderById.query({ id }),
	});

/**
 * Two-step order-number resolution (contract §3.2): the route param may be an
 * 8-char alphanumeric code (Y5WDHJC0) — never Number() it. Resolve via
 * getOrderIdByOrderNumber → numeric id → getOrderById.
 */
export const orderIdByNumberQueryOptions = (orderNumber: string) =>
	queryOptions({
		queryKey: orderKeys.byNumber(orderNumber),
		queryFn: () => api.order.getOrderIdByOrderNumber.query({ orderNumber }),
	});

/** Delivery zones for the ship dialog. 24h stale like the legacy admin. */
export const deliveryZonesQueryOptions = () =>
	queryOptions({
		queryKey: orderKeys.zones,
		queryFn: () => api.order.getDeliveryAddressZones.query(),
		staleTime: 1000 * 60 * 60 * 24,
		gcTime: 1000 * 60 * 60 * 24,
	});

/** Instant product search inside the order form (debounced by the caller). */
export const productInstantSearchQueryOptions = (query: string) =>
	queryOptions({
		queryKey: orderKeys.productSearch(query),
		queryFn: () =>
			api.product.searchProductsInstant.query({ query, limit: 10 }),
		enabled: query.trim().length > 0,
	});
