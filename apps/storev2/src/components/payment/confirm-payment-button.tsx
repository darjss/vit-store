import { navigate } from "astro:transitions/client";
import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { trackPaymentConfirmed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import IconCheckboxCircle from "~icons/ri/checkbox-circle-fill";
import IconCloseCircle from "~icons/ri/close-circle-fill";
import IconLoader from "~icons/ri/loader-4-line";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";

const ConfirmPaymentButton = ({ paymentNumber }: { paymentNumber: string }) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.sendTransferNotification.mutate({
					paymentNumber,
				});
			},
			onSuccess: async (data) => {
				if (!data) {
					return;
				}

				trackPaymentConfirmed(paymentNumber, data.orderNumber);

				showToast({
					title: "Амжилттай",
					description: "Төлбөр баталгаажуулагдлаа",
					variant: "success",
					duration: 5000,
				});
				cart.clearCart();
				navigate(`/order/confirm/${data.orderNumber}`);
			},
		}),

		() => queryClient,
	);

	const handleConfirmPayment = () => {
		mutation.mutate();
	};

	return (
		<Button onClick={handleConfirmPayment}>
			<Show when={mutation.isPending}>
				<IconLoader class="mr-2 h-4 w-4 animate-spin" /> loading...
			</Show>
			<Show when={mutation.isSuccess}>
				<IconCheckboxCircle class="mr-2 h-4 w-4 text-green-500" /> Төлбөр
				баталгаажуулагдлаа
			</Show>
			<Show when={mutation.isError}>
				<IconCloseCircle class="mr-2 h-4 w-4 text-red-500" /> Төлбөр
				баталгаажуулах үед алдаа гарлаа
			</Show>
			<Show
				when={!mutation.isPending && !mutation.isSuccess && !mutation.isError}
			>
				<span>Төлбөр баталгаажуулах</span>
			</Show>
		</Button>
	);
};

export default ConfirmPaymentButton;
