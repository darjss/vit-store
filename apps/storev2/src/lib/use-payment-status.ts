import { useQuery } from "@tanstack/solid-query";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

interface UsePaymentStatusOptions {
	enabled?: boolean;
	refetchInterval?: number;
	// Extra key segment to scope cache per-invoice (qpay) vs per-payment.
	keySuffix?: unknown;
	// Seed the first render with server-provided status (payment-status page).
	initialData?: { status: string; provider: string };
}

/**
 * Single polling mechanism for `api.payment.getPaymentStatus`. Replaces the
 * three divergent copies in payment-status.tsx (createResource + setInterval),
 * payment-options.tsx (useQuery), and qpay-button.tsx (useQuery + navigated
 * guard). Call sites keep their own success-redirect guards; the URL
 * construction is centralized in `lib/payment-url.ts`.
 */
export function usePaymentStatus(
	paymentNumber: () => string,
	checkoutToken: () => string | undefined,
	opts: UsePaymentStatusOptions = {},
) {
	return useQuery(
		() => ({
			queryKey: [
				"payment-status",
				paymentNumber(),
				opts.keySuffix,
			],
			queryFn: () =>
				api.payment.getPaymentStatus.query({
					paymentNumber: paymentNumber(),
					checkoutToken: checkoutToken(),
				}),
			refetchInterval: opts.refetchInterval ?? 5000,
			enabled: opts.enabled ?? true,
			staleTime: 0,
			initialData: opts.initialData,
		}),
		() => queryClient,
	);
}
