import { onMount } from "solid-js";
import { paymentUrl } from "@/lib/payment-url";
import { api } from "@/lib/trpc";

const ResumePendingPayment = () => {
	onMount(() => {
		void (async () => {
			try {
				const user = await api.auth.check.query();
				const paymentNumber = user?.checkout?.paymentNumber;
				if (!paymentNumber) return;

				const payment = await api.payment.getPaymentByNumber.query({
					paymentNumber,
				});
				if (payment.status !== "pending") return;
				window.location.replace(paymentUrl(payment.paymentNumber));
			} catch {
				return;
			}
		})();
	});

	return null;
};

export default ResumePendingPayment;
