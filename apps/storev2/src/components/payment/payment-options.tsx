import { useMutation } from "@tanstack/solid-query";
import { BANK_TRANSFER_ENABLED, bankTransfer } from "@vit/shared/constants";
import type { PaymentProviderType } from "@vit/shared/types";
import { createEffect, createSignal, type JSX, Show } from "solid-js";
import ConfirmPaymentButton from "@/components/payment/confirm-payment-button";
import CopyFieldButton from "@/components/payment/copy-field-button";
import QpayPaymentPanel from "@/components/payment/qpay-button";
import { buttonVariants } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { paymentSuccessUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { usePaymentStatus } from "@/lib/use-payment-status";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import IconBank from "~icons/ri/bank-line";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconMobile from "~icons/ri/smartphone-line";

interface PaymentOptionsProps {
	paymentNumber: string;
	orderNumber: string;
	total: number;
	customerPhone: string;
	accountNumber?: string;
	accountName?: string;
	provider?: PaymentProviderType;
	checkoutToken?: string;
}

const TransferStep = (props: {
	number: number;
	title: string;
	children: JSX.Element;
}) => (
	<div class="flex gap-3">
		<div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-secondary-foreground text-sm">
			{props.number}
		</div>
		<div class="min-w-0 flex-1 space-y-2.5 pt-0.5">
			<p class="font-semibold text-foreground text-sm leading-snug sm:text-base">
				{props.title}
			</p>
			{props.children}
		</div>
	</div>
);

const FieldLabel = (props: { children: JSX.Element }) => (
	<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
		{props.children}
	</p>
);

const PaymentOptions = (props: PaymentOptionsProps) => {
	// F5: default tab honors the existing payment provider so a customer who
	// already chose transfer lands back on the transfer tab on revisit.
	const [tab, setTab] = createSignal<"transfer" | "qpay">(
		props.provider === "transfer" ? "transfer" : "qpay",
	);

	const selectTransferMutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.selectTransfer.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				});
			},
			// F2: surface failure instead of silently showing transfer
			// instructions as if the reconciler had started.
			onError: () => {
				showToast({
					title: "Алдаа",
					description:
						"Төлбөрийн хэлбэр сонгоход алдаа гарлаа. Дахин оролдоно уу.",
					variant: "error",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	const selectTab = (next: "transfer" | "qpay") => {
		setTab(next);
		if (next === "transfer") {
			selectTransferMutation.mutate();
		}
	};

	const [advanced, setAdvanced] = createSignal(false);
	const transferStatusQuery = usePaymentStatus(
		() => props.paymentNumber,
		() => props.checkoutToken,
		{
			refetchInterval: 5000,
			enabled: BANK_TRANSFER_ENABLED && tab() === "transfer" && !advanced(),
			keySuffix: "transfer-tab",
		},
	);

	createEffect(() => {
		if (advanced() || transferStatusQuery.data?.status !== "success") {
			return;
		}
		setAdvanced(true);
		cart.clearCart();
		void safeNavigate(
			paymentSuccessUrl(props.paymentNumber, props.checkoutToken),
		);
	});

	return (
		<div class="w-full">
			<Show when={BANK_TRANSFER_ENABLED}>
				<div class="mb-4 grid grid-cols-2 gap-1 rounded-full border border-border bg-muted/50 p-1 sm:mb-6">
					<button
						type="button"
						onClick={() => selectTab("transfer")}
						class="h-11 rounded-full font-semibold text-xs transition-[background-color,box-shadow,color] duration-200 ease-out-quart sm:text-sm"
						classList={{
							"bg-card text-foreground shadow-soft-sm": tab() === "transfer",
							"text-muted-foreground hover:text-foreground":
								tab() !== "transfer",
						}}
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<Show
								when={selectTransferMutation.isPending}
								fallback={
									<IconBank class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
								}
							>
								<span
									class="checkout-loader-ring size-4 rounded-full border-2 border-current/20 border-t-current sm:size-5"
									aria-hidden="true"
								/>
							</Show>
							<span>
								{selectTransferMutation.isPending ? "Бэлдэж байна" : "Данс"}
							</span>
						</span>
					</button>
					<button
						type="button"
						onClick={() => selectTab("qpay")}
						class="h-11 rounded-full font-semibold text-xs transition-[background-color,box-shadow,color] duration-200 ease-out-quart sm:text-sm"
						classList={{
							"bg-card text-foreground shadow-soft-sm": tab() === "qpay",
							"text-muted-foreground hover:text-foreground": tab() !== "qpay",
						}}
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<IconMobile class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
							<span>QPay</span>
						</span>
					</button>
				</div>
			</Show>

			<Show when={BANK_TRANSFER_ENABLED && tab() === "transfer"}>
				<div class="animate-payment-panel-left rounded-2xl border border-border bg-card shadow-soft">
					<div class="space-y-5 p-3 sm:space-y-6 sm:p-4">
						{/* F2: surface selectTransfer failure — don't show instructions
						    as if the reconciler started when it never did. */}
						<Show when={selectTransferMutation.isError}>
							<div class="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center">
								<IconErrorWarning class="h-8 w-8 text-destructive" />
								<div>
									<p class="font-semibold text-destructive text-sm">
										Автомат шалгалт эхлэхэд алдаа гарлаа
									</p>
									<p class="mt-1 text-muted-foreground text-xs">
										Төлбөрөө шилжүүлсний дараа доорх товчийг дарж гараар
										баталгаажуулна уу.
									</p>
								</div>
								<button
									type="button"
									onClick={() => selectTransferMutation.mutate()}
									class={cn(buttonVariants({ size: "sm" }))}
								>
									Дахин оролдох
								</button>
							</div>
						</Show>
						<TransferStep
							number={1}
							title="Яг доорх дүнг данс руу шилжүүлнэ үү"
						>
							<div class="flex items-center gap-2.5 rounded-xl bg-muted/30 p-2.5 sm:p-3">
								<div class="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background sm:size-10">
									<img
										src="/khaan.png"
										alt="Khaan logo"
										class="h-full w-full object-contain p-1.5"
									/>
								</div>
								<div class="min-w-0">
									<div class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider">
										Банк
									</div>
									<div class="truncate font-semibold text-foreground text-sm sm:text-base">
										{bankTransfer.bankName}
									</div>
								</div>
							</div>

							<div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
								<div class="space-y-1.5">
									<FieldLabel>Дансны дугаар</FieldLabel>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-background px-2.5 py-2.5 font-mono text-sm tracking-wide sm:px-3 sm:text-base">
											{props.accountNumber ?? bankTransfer.accountNumber}
										</div>
										<CopyFieldButton
											text={props.accountNumber ?? bankTransfer.accountNumber}
											label="Дансны дугаар"
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<FieldLabel>Дүн</FieldLabel>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-wash-lemon px-2.5 py-2.5 font-mono text-base text-foreground sm:px-3 sm:text-lg">
											{props.total.toLocaleString()}₮
										</div>
										<CopyFieldButton text={props.total} label="Дүн" />
									</div>
								</div>
							</div>

							<div class="space-y-1.5">
								<FieldLabel>Дансны нэр</FieldLabel>
								<div class="rounded-xl border border-border bg-background px-2.5 py-2.5 font-medium text-xs leading-tight sm:px-3 sm:text-sm">
									{props.accountName ?? bankTransfer.accountName}
								</div>
							</div>
						</TransferStep>

						<TransferStep
							number={2}
							title="Гүйлгээний утга дээр утасны дугаараа бичнэ үү"
						>
							<div class="space-y-1.5">
								<FieldLabel>Гүйлгээний утга</FieldLabel>
								<div class="flex min-w-0 items-stretch">
									<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-background px-2.5 py-2.5 font-mono text-sm tracking-wide sm:px-3 sm:text-base">
										{props.customerPhone}
									</div>
									<CopyFieldButton
										text={props.customerPhone}
										label="Утасны дугаар"
									/>
								</div>
							</div>
							<p class="text-muted-foreground text-xs leading-snug sm:text-sm">
								Бид энэ дугаараар таны төлбөрийг автоматаар олж баталгаажуулна.
							</p>
						</TransferStep>

						<TransferStep
							number={3}
							title="Шилжүүлсний дараа доорх товчийг дарна уу"
						>
							<p class="text-muted-foreground text-xs leading-snug sm:text-sm">
								Товч дарснаар автомат шалгалт эхэлж, ихэвчлэн хэдхэн минутын
								дотор баталгаажна.
							</p>
							<ConfirmPaymentButton
								paymentNumber={props.paymentNumber}
								checkoutToken={props.checkoutToken}
							/>
						</TransferStep>
					</div>
				</div>
			</Show>

			<Show when={!BANK_TRANSFER_ENABLED || tab() === "qpay"}>
				<div class="animate-payment-panel-right rounded-2xl border border-border bg-card shadow-soft">
					<div class="p-3 sm:p-5">
						<QpayPaymentPanel
							paymentNumber={props.paymentNumber}
							amount={props.total}
							checkoutToken={props.checkoutToken}
						/>
					</div>
				</div>
			</Show>
		</div>
	);
};

export default PaymentOptions;
