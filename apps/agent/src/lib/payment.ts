import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

// Boundary to the EXISTING store payment API for the post-order Messenger
// payment surface (#25). Rides the SHARED typed tRPC client (`storeClient()` in
// ./store-client) the storefront pattern uses, so the agent (Cloudflare Worker)
// calls the SAME store router the storefront uses — payment logic is never
// duplicated here and only @trpc/client + superjson reach the worker bundle.
//
// CRITICAL (ADR 0004): a bank-transfer claim records `payment.claimTransferPaid`
// only — which sets the payment to `customer_claimed_paid` and notifies admin.
// It NEVER calls a payment-CONFIRMATION procedure (`payment.confirmPayment` /
// `confirmPaymentAndApplyStock` / the QPay invoice check), so a customer can
// never auto-confirm their own payment. Confirmation stays with admin/bank.

// Only the fields the transfer message needs: the authoritative total (the
// transfer amount) and the customer phone (the transfer reference). Validated at
// the boundary so api-side drift fails loudly here.
const paymentSummarySchema = v.object({
	paymentNumber: v.string(),
	status: v.string(),
	total: v.number(),
	order: v.object({
		orderNumber: v.string(),
		customerPhone: v.string(),
	}),
});

export type PaymentSummary = v.InferOutput<typeof paymentSummarySchema>;

// `payment.getPaymentByNumber` (a tRPC query): looks up the payment summary.
export const fetchPaymentSummary = async (
	paymentNumber: string,
	checkoutToken: string | null,
	outerSignal?: AbortSignal,
): Promise<PaymentSummary> => {
	const data = await storeClient().payment.getPaymentByNumber.query(
		{
			paymentNumber,
			...(checkoutToken ? { checkoutToken } : {}),
		},
		{ signal: withTimeout(outerSignal) },
	);
	// Defense-in-depth: the typed client gives compile-time safety, but the
	// valibot guard still fails loudly on RUNTIME api-side shape drift.
	return v.parse(paymentSummarySchema, data);
};

const claimResultSchema = v.object({
	orderNumber: v.nullable(v.optional(v.string())),
});

// `payment.claimTransferPaid` (a tRPC mutation): records the customer's transfer
// CLAIM (status → `customer_claimed_paid`) and notifies admin. This is the ONLY
// payment write a transfer claim performs; it is NOT a confirmation.
export const claimTransfer = async (
	paymentNumber: string,
	checkoutToken: string | null,
	outerSignal?: AbortSignal,
): Promise<{ orderNumber?: string | null }> => {
	const data = await storeClient().payment.claimTransferPaid.mutate(
		{
			paymentNumber,
			...(checkoutToken ? { checkoutToken } : {}),
		},
		{ signal: withTimeout(outerSignal) },
	);
	return v.parse(claimResultSchema, data);
};
