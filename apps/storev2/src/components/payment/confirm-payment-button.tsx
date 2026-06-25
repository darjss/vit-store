import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { trackPaymentConfirmed } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import IconCheckboxCircle from "~icons/ri/checkbox-circle-fill";
import IconCloseCircle from "~icons/ri/close-circle-fill";
import IconLoader from "~icons/ri/loader-4-line";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";

const PENDING_APPROVAL_MESSAGE = "Таны захиалга удахгүй баталгаажина";

const ConfirmPaymentButton = (props: {
	paymentNumber: string;
	checkoutToken?: string;
}) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.sendTransferNotification.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				} as { paymentNumber: string });
			},
			onSuccess: async (data) => {
				if (!data?.orderNumber) return;

				trackPaymentConfirmed(props.paymentNumber, data.orderNumber);

				showToast({
					title: "Амжилттай",
					description: PENDING_APPROVAL_MESSAGE,
					variant: "success",
					duration: 5000,
				});
				cart.clearCart();
				void safeNavigate(`/order/confirm/${data.orderNumber}`);
			},
			onError: () => {
				showToast({
					title: "Алдаа",
					description:
						"Хүсэлт илгээхэд алдаа гарлаа. Төлбөрөө шилжүүлсэн бол бид удахгүй шалгана.",
					variant: "error",
					duration: 5000,
				});
			},
		}),

		() => queryClient,
	);

	const handleConfirmPayment = () => {
		mutation.mutate();
	};

	return (
		<Button size="lg" onClick={handleConfirmPayment}>
			<Show when={mutation.isPending}>
				<IconLoader class="mr-2 h-4 w-4 animate-spin" /> Уншиж
				байна...
			</Show>
			<Show when={mutation.isSuccess}>
				<IconCheckboxCircle class="mr-2 h-4 w-4 text-green-500" />{" "}
				{PENDING_APPROVAL_MESSAGE}
			</Show>
			<Show when={mutation.isError}>
				<IconCloseCircle class="mr-2 h-4 w-4 text-red-500" /> Дахин
				оролдоно уу
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
