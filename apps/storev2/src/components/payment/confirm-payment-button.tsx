import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { WorkingStatus } from "@/components/ui/working-status";
import { orderConfirmUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import { CardIcon as IconBankCard } from "@solar-icons/solid/linear";
import {
	CheckCircleIcon as IconCheckboxCircle,
	CloseCircleIcon as IconCloseCircle,
} from "@solar-icons/solid/bold";
import { Button } from "../ui/button";
import { showToast } from "../ui/toast";

const PENDING_APPROVAL_MESSAGE = "Таны захиалга удахгүй баталгаажина";

const ConfirmPaymentButton = (props: { checkoutToken?: string; paymentNumber: string }) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.sendTransferNotification.mutate({
					checkoutToken: props.checkoutToken,
					paymentNumber: props.paymentNumber,
				});
			},
			onError: () => {
				showToast({
					description: "Хүсэлт илгээхэд алдаа гарлаа. Төлбөрөө шилжүүлсэн бол бид удахгүй шалгана.",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
				});
			},
			onSuccess: async (data) => {
				if (!data?.orderNumber) {
					return;
				}

				showToast({
					description: PENDING_APPROVAL_MESSAGE,
					duration: 5000,
					title: "Амжилттай",
					variant: "success",
				});
				cart.clearCart();
				void safeNavigate(orderConfirmUrl(data.orderNumber, props.checkoutToken));
			},
		}),

		() => queryClient,
	);

	const handleConfirmPayment = () => {
		mutation.mutate();
	};

	return (
		<Button class="w-full" disabled={mutation.isPending} onClick={handleConfirmPayment} size="lg">
			<Show when={mutation.isPending}>
				<WorkingStatus icon={<IconBankCard />} label="Төлбөр шалгаж байна" />
			</Show>
			<Show when={mutation.isSuccess}>
				<span class="animate-payment-state-pop flex items-center gap-2">
					<IconCheckboxCircle class="size-5" /> {PENDING_APPROVAL_MESSAGE}
				</span>
			</Show>
			<Show when={mutation.isError}>
				<span class="animate-payment-state-pop flex items-center gap-2">
					<IconCloseCircle class="size-5" /> Дахин оролдоно уу
				</span>
			</Show>
			<Show when={!mutation.isPending && !mutation.isSuccess && !mutation.isError}>
				<span class="flex items-center gap-2">
					<IconBankCard class="size-5" />
					Шилжүүлсэн — төлбөрөө шалгуулах
				</span>
			</Show>
		</Button>
	);
};

export default ConfirmPaymentButton;
