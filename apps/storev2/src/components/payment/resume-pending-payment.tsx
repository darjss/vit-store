import { onMount } from "solid-js";
import {
	clearActivePayment,
	readActivePayment,
	writeActivePayment,
} from "@/lib/active-payment";
import { paymentSuccessUrl, paymentUrl } from "@/lib/payment-url";
import { api } from "@/lib/trpc";

const resumePaths = new Set(["", "/", "/cart"]);

const normalizePath = (pathname: string) => {
	if (pathname.length > 1 && pathname.endsWith("/")) {
		return pathname.slice(0, -1);
	}
	return pathname;
};

const ResumePendingPayment = () => {
	onMount(() => {
		const path = normalizePath(window.location.pathname);
		if (!resumePaths.has(path)) return;

		void (async () => {
			let paymentNumber: string | undefined;
			let checkoutToken: string | undefined;

			const stored = readActivePayment();
			if (stored) {
				paymentNumber = stored.paymentNumber;
				checkoutToken = stored.checkoutToken;
			} else {
				try {
					const user = await api.auth.check.query();
					const checkout = (
						user as { checkout?: { paymentNumber?: string } } | null
					)?.checkout;
					if (checkout?.paymentNumber) {
						paymentNumber = checkout.paymentNumber;
					}
				} catch {
					return;
				}
			}

			if (!paymentNumber) return;

			try {
				const payment = await api.payment.getPaymentByNumber.query({
					paymentNumber,
					checkoutToken,
				});
				if (payment.status === "success") {
					clearActivePayment();
					window.location.replace(
						paymentSuccessUrl(payment.paymentNumber, checkoutToken),
					);
					return;
				}
				if (payment.status !== "pending") {
					clearActivePayment();
					return;
				}
				writeActivePayment(payment.paymentNumber, checkoutToken);
				window.location.replace(
					paymentUrl(payment.paymentNumber, checkoutToken),
				);
			} catch {
				clearActivePayment();
			}
		})();
	});

	return null;
};

export default ResumePendingPayment;
