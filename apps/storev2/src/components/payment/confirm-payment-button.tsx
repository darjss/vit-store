import { useMutation } from "@tanstack/solid-query";
import { Show } from "solid-js";
import { WorkingStatus } from "@/components/ui/working-status";
import { orderConfirmUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import { CardIcon as IconBankCard } from "@solar-icons/solid/linear";
import { CheckCircleIcon as IconCheckboxCircle, CloseCircleIcon as IconCloseCircle } from "@solar-icons/solid/bold";
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
				});
			},
			onSuccess: async (data) => {
				if (!data?.orderNumber) return;

				showToast({
					title: "Амжилттай",
					description: PENDING_APPROVAL_MESSAGE,
					variant: "success",
					duration: 5000,
				});
				cart.clearCart();
				void safeNavigate(
					orderConfirmUrl(data.orderNumber, props.checkoutToken),
				);
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
		<Button
			size="lg"
			class="w-full"
			disabled={mutation.isPending}
			onClick={handleConfirmPayment}
		>
			<Show when={mutation.isPending}>
				<WorkingStatus
					label="Төлбөр шалгаж байна"
					icon={<IconBankCard />}
				/>
			</Show>
			<Show when={mutation.isSuccess}>
				<span class="flex animate-payment-state-pop items-center gap-2">
					<IconCheckboxCircle class="size-5" /> {PENDING_APPROVAL_MESSAGE}
				</span>
			</Show>
			<Show when={mutation.isError}>
				<span class="flex animate-payment-state-pop items-center gap-2">
					<IconCloseCircle class="size-5" /> Дахин оролдоно уу
				</span>
			</Show>
			<Show
				when={!mutation.isPending && !mutation.isSuccess && !mutation.isError}
			>
				<span class="flex items-center gap-2">
					<IconBankCard class="size-5" />
					Шилжүүлсэн — төлбөрөө шалгуулах
				</span>
			</Show>
		</Button>
	);
};

export default ConfirmPaymentButton;
