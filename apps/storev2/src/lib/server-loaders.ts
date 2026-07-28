import type { TRPCClient } from "@trpc/client";
import type { StoreRouter } from "@vit/api";
import {
	deserializeResultOrThrow,
	orderAccessErrorSchema,
	orderTrackingSchema,
	paymentDetailsSchema,
	paymentErrorSchema,
	type OrderTracking,
	type PaymentDetails,
	type PaymentError,
} from "@vit/shared";
import { match } from "dismatch";
import { withCt } from "@/lib/payment-url";

type ServerApi = TRPCClient<StoreRouter>;
type PaymentLoadResult = { payment: PaymentDetails } | { redirect: Response };
type OrderLoadResult = { order: OrderTracking } | { redirect: Response };

const paymentErrorRedirect = (error: PaymentError) =>
	match(
		error,
		"_tag",
	)({
		PaymentNotFound: () => "/404",
		PaymentAccessDenied: () => "/order-tracking",
		PaymentAlreadyConfirmed: () => "/order-tracking",
		PaymentNotPending: () => "/order-tracking",
		PaymentMethodMismatch: () => "/order-tracking",
		PaymentProviderUnavailable: () => "/order-tracking",
		PaymentConfirmationConflict: () => "/order-tracking",
		BankTransactionAlreadyConsumed: () => "/order-tracking",
		ManualReviewRequired: () => "/order-tracking",
	});

export async function loadPaymentOrRedirect(
	serverApi: ServerApi,
	paymentNumber: string,
	checkoutToken: string | undefined,
	redirect: (path: string) => Response,
) {
	const result = deserializeResultOrThrow(
		await serverApi.v2.payment.getPaymentByNumber.query({
			paymentNumber,
			checkoutToken,
		}),
		{ value: paymentDetailsSchema, error: paymentErrorSchema },
	);
	return result.match<PaymentLoadResult>({
		ok: (payment) => ({ payment }),
		err: (error) => ({ redirect: redirect(paymentErrorRedirect(error)) }),
	});
}

export async function loadOrderOrRedirect(
	serverApi: ServerApi,
	orderNumber: string,
	checkoutToken: string | undefined,
	redirect: (path: string) => Response,
) {
	const result = deserializeResultOrThrow(
		await serverApi.v2.order.getOrderByOrderNumber.query({
			orderNumber,
			checkoutToken,
		}),
		{ value: orderTrackingSchema, error: orderAccessErrorSchema },
	);
	return result.match<OrderLoadResult>({
		ok: (order) => ({ order }),
		err: (error) => ({
			redirect: redirect(
				error._tag === "OrderNotFound" ? "/404" : "/order-tracking",
			),
		}),
	});
}

export { withCt };
