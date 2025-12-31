import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { trackPaymentConfirmed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";
import { navigate } from "astro:transitions/client";
import IconLoader from "~icons/ri/loader-4-line";
import IconCheckboxCircle from "~icons/ri/checkbox-circle-fill";
import IconCloseCircle from "~icons/ri/close-circle-fill";

const ConfirmPaymentButton = ({ paymentNumber }: { paymentNumber: string }) => {
	console.log("paymentNumber", paymentNumber);
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

				// Track payment confirmed
				trackPaymentConfirmed(paymentNumber, data.orderNumber);

				showToast({
					title: "Амжилттай",
					description: "Төлбөр баталгаажуулагдлаа",
					variant: "success",
					duration: 5000,
				});
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
				<IconLoader class="h-4 w-4 animate-spin mr-2" /> loading...
			</Show>
			<Show when={mutation.isSuccess}>
				<IconCheckboxCircle class="h-4 w-4 text-green-500 mr-2" /> Төлбөр
				баталгаажуулагдлаа
			</Show>
			<Show when={mutation.isError}>
				<IconCloseCircle class="h-4 w-4 text-red-500 mr-2" /> Төлбөр
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
