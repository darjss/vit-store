import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";

const ubDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" });

// The pack list and its badge only cover orders placed today in Ulaanbaatar.
export const placedToday = <T extends { createdAt: Date | string }>(orders: Array<T>) => {
	const today = ubDay.format(new Date());
	return orders.filter((order) => ubDay.format(new Date(order.createdAt)) === today);
};

// Badge counts shared by the sidebar, the phone tab bar and home.
export function useNavCounts() {
	const pending = useQuery(trpc.order.getPendingOrders.queryOptions());
	const claimed = useQuery(trpc.payment.getClaimedTransferCount.queryOptions());
	return {
		claimed: claimed.data === undefined ? undefined : Number(claimed.data),
		pending: pending.data && placedToday(pending.data).length,
	};
}

export type NavCountKey = keyof ReturnType<typeof useNavCounts>;
