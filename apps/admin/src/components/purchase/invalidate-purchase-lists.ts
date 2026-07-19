import type { QueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

export function invalidatePurchaseLists(queryClient: QueryClient) {
	return queryClient.invalidateQueries({
		queryKey: trpc.purchase.getPaginatedPurchases.queryKey(),
	});
}
