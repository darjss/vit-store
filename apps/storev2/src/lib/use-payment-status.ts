import { useQuery } from "@tanstack/solid-query";
import {
	paymentErrorSchema,
	paymentStatusSchema,
	type PaymentError,
	type PaymentStatus,
} from "@vit/shared";
import { Result } from "better-result";
import { queryClient } from "@/lib/query";
import { resultQueryOptions } from "@/lib/result-query";
import { api } from "@/lib/trpc";

interface UsePaymentStatusOptions {
	enabled?: boolean;
	refetchInterval?: number;
	keySuffix?: unknown;
	initialData?: PaymentStatus;
}

export function usePaymentStatus(
	paymentNumber: () => string,
	checkoutToken: () => string | undefined,
	opts: UsePaymentStatusOptions = {},
) {
	const options = () => ({
		...resultQueryOptions({
			queryKey: ["payment-status", paymentNumber(), opts.keySuffix] as const,
			request: () =>
				api.v2.payment.getPaymentStatus.query({
					paymentNumber: paymentNumber(),
					checkoutToken: checkoutToken(),
				}),
			schemas: { value: paymentStatusSchema, error: paymentErrorSchema },
		}),
		refetchInterval: opts.refetchInterval ?? 5000,
		enabled: opts.enabled ?? true,
		staleTime: 0,
	});
	if (!opts.initialData) return useQuery(options, () => queryClient);

	const initialData = Result.ok<PaymentStatus, PaymentError>(opts.initialData);
	return useQuery(
		() => ({ ...options(), initialData }),
		() => queryClient,
	);
}
