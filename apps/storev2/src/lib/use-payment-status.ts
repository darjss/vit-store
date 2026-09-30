import { useQuery } from "@tanstack/solid-query";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";

interface UsePaymentStatusOptions {
	enabled?: boolean;
	// Seed the first render with server-provided status (payment-status page).
	initialData?: { provider: string; status: string };
	// Extra key segment to scope cache per-invoice (qpay) vs per-payment.
	keySuffix?: unknown;
	refetchInterval?: number;
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
			enabled: opts.enabled ?? true,
			initialData: opts.initialData,
			queryFn: () =>
				api.payment.getPaymentStatus.query({
					checkoutToken: checkoutToken(),
					paymentNumber: paymentNumber(),
				}),
			queryKey: ["payment-status", paymentNumber(), opts.keySuffix],
			refetchInterval: opts.refetchInterval ?? 5000,
			staleTime: 0,
		}),
		() => queryClient,
	);
}
