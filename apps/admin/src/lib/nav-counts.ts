import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

// Badge counts shared by the sidebar, the phone tab bar and home.
export function useNavCounts() {
	const pending = useQuery(trpc.order.getPendingOrders.queryOptions());
	const claimed = useQuery(trpc.payment.getClaimedTransferCount.queryOptions());
	return {
		claimed: claimed.data === undefined ? undefined : Number(claimed.data),
		pending: pending.data?.length,
	};
}

export type NavCountKey = keyof ReturnType<typeof useNavCounts>;
