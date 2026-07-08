/**
 * Centralized checkout-token URL construction. Every payment-flow redirect
 * appends `?ct=<encoded checkoutToken>` only when a token exists, otherwise
 * yields the bare path. Replaces the repeated
 * `ct ? \`${path}?ct=${encodeURIComponent(ct)}\` : path` ternaries spread
 * across payment pages, polling effects, and mutation callbacks.
 */
export function withCt(path: string, checkoutToken?: string): string {
	return checkoutToken
		? `${path}?ct=${encodeURIComponent(checkoutToken)}`
		: path;
}

export const paymentSuccessUrl = (
	paymentNumber: string,
	checkoutToken?: string,
) => withCt(`/payment/success/${paymentNumber}`, checkoutToken);

export const orderConfirmUrl = (
	orderNumber: string,
	checkoutToken?: string,
) => withCt(`/order/confirm/${orderNumber}`, checkoutToken);

export const paymentUrl = (
	paymentNumber: string,
	checkoutToken?: string,
) => withCt(`/payment/${paymentNumber}`, checkoutToken);
