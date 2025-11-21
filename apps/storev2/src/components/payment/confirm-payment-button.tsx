import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";
import { navigate } from "astro:transitions/client";

const ConfirmPaymentButton = ({ paymentNumber }: { paymentNumber: string }) => {
    console.log("paymentNumber", paymentNumber);
	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.sendTransferNotification.mutate({ paymentNumber });
			},
			onSuccess: async (data) => {
				if(!data) {
					return;
				}
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
            🗣️ loading...
			</Show>
			<Show when={mutation.isSuccess}>
			✅ Төлбөр баталгаажуулагдлаа
			</Show>
			<Show when={mutation.isError}>
			❌ Төлбөр баталгаажуулах үед алдаа гарлаа
			</Show>
            <Show when={!mutation.isPending && !mutation.isSuccess && !mutation.isError}>
				<span>Төлбөр баталгаажуулах</span>
			</Show>
		</Button>
	);
};

export default ConfirmPaymentButton;
