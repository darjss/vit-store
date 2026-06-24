import { SuperJSON } from "superjson";
import * as v from "valibot";

// Boundary to the EXISTING store payment API for the post-order Messenger
// payment surface (#25). Mirrors `src/lib/order.ts`: a thin hand-rolled tRPC
// transport (no heavy api/tRPC type graph in the worker) over the SAME store
// router the storefront uses.
//
// CRITICAL (ADR 0004): a bank-transfer claim records `payment.claimTransferPaid`
// only — which sets the payment to `customer_claimed_paid` and notifies admin.
// It NEVER calls a payment-CONFIRMATION procedure (`payment.confirmPayment` /
// `confirmPaymentAndApplyStock` / the QPay invoice check), so a customer can
// never auto-confirm their own payment. Confirmation stays with admin/bank.
const storeApiUrl = (): string => {
	const base = process.env.STORE_API_URL ?? "http://localhost:3000";
	return `${base.replace(/\/+$/, "")}/trpc/store`;
};

interface TrpcResponse {
	result?: { data?: unknown };
	error?: { message?: string };
}

const PAYMENT_FETCH_TIMEOUT_MS = 10_000;

const readTrpc = async <T>(
	procedure: string,
	response: Response,
	schema: v.GenericSchema<unknown, T>,
): Promise<T> => {
	if (!response.ok) {
		throw new Error(`${procedure} request failed (${response.status})`);
	}
	const body = (await response.json()) as TrpcResponse;
	if (body.error || !body.result) {
		throw new Error(body.error?.message ?? `${procedure} returned an error`);
	}
	const deserialized = SuperJSON.deserialize(
		body.result.data as Parameters<typeof SuperJSON.deserialize>[0],
	);
	return v.parse(schema, deserialized);
};

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

// `payment.getPaymentByNumber` (a tRPC query) over the catalog-style GET path.
export const fetchPaymentSummary = async (
	paymentNumber: string,
	checkoutToken: string | null,
	outerSignal?: AbortSignal,
): Promise<PaymentSummary> => {
	const input = encodeURIComponent(
		JSON.stringify(
			SuperJSON.serialize({
				paymentNumber,
				...(checkoutToken ? { checkoutToken } : {}),
			}),
		),
	);
	const url = `${storeApiUrl()}/payment.getPaymentByNumber?input=${input}`;
	const response = await fetch(url, {
		method: "GET",
		headers: { "content-type": "application/json" },
		signal: signal(PAYMENT_FETCH_TIMEOUT_MS, outerSignal),
	});
	return readTrpc("payment.getPaymentByNumber", response, paymentSummarySchema);
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
	const url = `${storeApiUrl()}/payment.claimTransferPaid`;
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(
			SuperJSON.serialize({
				paymentNumber,
				...(checkoutToken ? { checkoutToken } : {}),
			}),
		),
		signal: signal(PAYMENT_FETCH_TIMEOUT_MS, outerSignal),
	});
	return readTrpc("payment.claimTransferPaid", response, claimResultSchema);
};

const signal = (ms: number, outer?: AbortSignal): AbortSignal => {
	const timeout = AbortSignal.timeout(ms);
	return outer ? AbortSignal.any([outer, timeout]) : timeout;
};
