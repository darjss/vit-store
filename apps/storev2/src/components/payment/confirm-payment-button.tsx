import { useMutation } from "@tanstack/solid-query";
import {
	paymentErrorSchema,
	transferClaimSchema,
	type PaymentError,
} from "@vit/shared";
import { Show } from "solid-js";
import {
	paymentErrorPresentation,
	unexpectedCommerceError,
} from "@/lib/error-presentations/commerce";
import { clearCheckoutIdempotency } from "@/lib/checkout-idempotency";
import { orderConfirmUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { resultMutationOptions } from "@/lib/result-query";
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

const ConfirmPaymentButton = (props: {
	paymentNumber: string;
	checkoutToken?: string;
}) => {
	const mutation = useMutation(
		() => ({
			...resultMutationOptions(
				() =>
					api.v2.payment.sendTransferNotification.mutate({
						paymentNumber: props.paymentNumber,
						checkoutToken: props.checkoutToken,
					}),
				{ value: transferClaimSchema, error: paymentErrorSchema },
			),
			onSuccess: (result) => {
				result.match({
					ok: (data) => {
						showToast({
							title: "Амжилттай",
							description: PENDING_APPROVAL_MESSAGE,
							variant: "success",
							duration: 5000,
						});
						cart.clearCart();
						clearCheckoutIdempotency();
						void safeNavigate(
							orderConfirmUrl(data.orderNumber, props.checkoutToken),
						);
					},
					err: (error) => {
						const presentation = paymentErrorPresentation(error);
						showToast({
							title: presentation.title,
							description: presentation.description,
							variant: "error",
							duration: 7000,
						});
					},
				});
			},
			onError: () => {
				showToast({
					title: unexpectedCommerceError.title,
					description: unexpectedCommerceError.description,
					variant: "error",
					duration: 7000,
				});
			},
		}),
		() => queryClient,
	);

	const expectedError = () =>
		mutation.data?.match<PaymentError | undefined>({
			ok: () => undefined,
			err: (error) => error,
		});
	const succeeded = () =>
		mutation.data?.match({ ok: () => true, err: () => false }) ?? false;

	const handleConfirmPayment = () => {
		mutation.mutate(undefined);
	};

	return (
		<Button
			size="lg"
			class={mutation.isPending ? "w-full animate-submit-working" : "w-full"}
			disabled={mutation.isPending}
			onClick={handleConfirmPayment}
		>
			<Show when={mutation.isPending}>
				<span class="flex animate-payment-state-pop items-center gap-3">
					<span
						class="relative grid size-7 place-items-center"
						aria-hidden="true"
					>
						<svg class="absolute inset-0 size-7" viewBox="0 0 28 28">
							<title>Төлбөр шалгаж байна</title>
							<circle
								cx="14"
								cy="14"
								r="10"
								fill="none"
								stroke="currentColor"
								stroke-opacity="0.2"
								stroke-width="2.5"
							/>
							<path
								class="checkout-loader-ring"
								d="M14 4a10 10 0 0 1 10 10"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-width="3"
							/>
						</svg>
						<IconBankCard class="size-3.5" />
					</span>
					<span class="text-left leading-tight">
						<span class="block">Төлбөр шалгаж байна</span>
						<span class="mt-1 flex gap-1" aria-hidden="true">
							<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
							<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
							<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
						</span>
					</span>
				</span>
			</Show>
			<Show when={succeeded()}>
				<span class="flex animate-payment-state-pop items-center gap-2">
					<IconCheckboxCircle class="size-5" /> {PENDING_APPROVAL_MESSAGE}
				</span>
			</Show>
			<Show when={mutation.isError || expectedError()}>
				<span class="flex animate-payment-state-pop items-center gap-2">
					<IconCloseCircle class="size-5" /> Дахин оролдоно уу
				</span>
			</Show>
			<Show
				when={
					!mutation.isPending &&
					!mutation.isError &&
					!expectedError() &&
					!succeeded()
				}
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
