/*
 * Orders — mutation modules.
 *
 * Plain mutation-option factories (this @tanstack/solid-query version has no
 * `mutationOptions` helper). Components pass them to createMutation wrapped
 * in an accessor and attach cache-sync handlers from cache.ts. Mutations
 * never retry (shell rule).
 */
import { api } from "@/lib/trpc";

export type UpdateOrderStatusInput = Parameters<
	typeof api.order.updateOrderStatus.mutate
>[0];
export type ShipOrderInput = Parameters<typeof api.order.shipOrder.mutate>[0];
export type DeleteOrderInput = Parameters<
	typeof api.order.deleteOrder.mutate
>[0];
export type UpdateOrderInput = Parameters<
	typeof api.order.updateOrder.mutate
>[0];
export type AddOrderInput = Parameters<typeof api.order.addOrder.mutate>[0];
export type PatchOrderHeaderInput = Parameters<
	typeof api.order.patchOrderHeader.mutate
>[0];

export const updateOrderStatusMutationOptions = () => ({
	mutationFn: (input: UpdateOrderStatusInput) =>
		api.order.updateOrderStatus.mutate(input),
});

export const shipOrderMutationOptions = () => ({
	mutationFn: (input: ShipOrderInput) => api.order.shipOrder.mutate(input),
});

export const deleteOrderMutationOptions = () => ({
	mutationFn: (input: DeleteOrderInput) => api.order.deleteOrder.mutate(input),
});

export const updateOrderMutationOptions = () => ({
	mutationFn: (input: UpdateOrderInput) => api.order.updateOrder.mutate(input),
});

export const addOrderMutationOptions = () => ({
	mutationFn: (input: AddOrderInput) => api.order.addOrder.mutate(input),
});

export const patchOrderHeaderMutationOptions = () => ({
	mutationFn: (input: PatchOrderHeaderInput) =>
		api.order.patchOrderHeader.mutate(input),
});
