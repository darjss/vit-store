import type { StoreRouter } from "@vit/api";
import type { TRPCClient } from "@trpc/client";
import { withCt } from "@/lib/payment-url";

type ServerApi = TRPCClient<StoreRouter>;

const errorCode = (err: unknown): string | undefined => {
	const e = err as { data?: { code?: string }; code?: string };
	return e?.data?.code ?? e?.code;
};

/**
 * Load a payment by number via the server tRPC client, redirecting on the
 * UNAUTHORIZED / NOT_FOUND errors shared by every payment-flow page. Throws
 * on any other error so the page's error boundary handles it.
 */
export async function loadPaymentOrRedirect(
	serverApi: ServerApi,
	paymentNumber: string,
	checkoutToken: string | undefined,
	redirect: (path: string) => Response,
) {
	let payment;
	try {
		payment = await serverApi.payment.getPaymentByNumber.query({
			paymentNumber,
			checkoutToken,
		});
	} catch (err) {
		const code = errorCode(err);
		if (code === "UNAUTHORIZED") return { redirect: redirect("/order-tracking") };
		if (code === "NOT_FOUND") return { redirect: redirect("/404") };
		throw err;
	}
	if (!payment) return { redirect: redirect("/404") };
	return { payment };
}

/**
 * Load an order by number via the server tRPC client, redirecting on the
 * UNAUTHORIZED / NOT_FOUND errors shared by every order-flow page.
 */
export async function loadOrderOrRedirect(
	serverApi: ServerApi,
	orderNumber: string,
	checkoutToken: string | undefined,
	redirect: (path: string) => Response,
) {
	let order;
	try {
		order = await serverApi.order.getOrderByOrderNumber.query({
			orderNumber,
			checkoutToken,
		});
	} catch (err) {
		const code = errorCode(err);
		if (code === "UNAUTHORIZED") return { redirect: redirect("/order-tracking") };
		if (code === "NOT_FOUND") return { redirect: redirect("/404") };
		throw err;
	}
	if (!order) return { redirect: redirect("/404") };
	return { order };
}

export { withCt };
