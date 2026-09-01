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
import { BuildingsIcon as IconBank, SmartphoneIcon as IconMobile } from "@solar-icons/solid/linear";
import { DangerCircleIcon as IconErrorWarning } from "@solar-icons/solid/bold";

interface PaymentOptionsProps {
	accountName?: string;
	accountNumber?: string;
	checkoutToken?: string;
	customerPhone: string;
	orderNumber: string;
	paymentNumber: string;
	provider?: PaymentProviderType;
	total: number;
}

const TransferStep = (props: { children: JSX.Element; number: number; title: string }) => (
	<div class="flex gap-3">
		<div class="bg-secondary font-display text-secondary-foreground flex size-7 shrink-0 items-center justify-center rounded-full text-sm">
			{props.number}
		</div>
		<div class="min-w-0 flex-1 space-y-2.5 pt-0.5">
			<p class="text-foreground text-sm leading-snug font-semibold sm:text-base">{props.title}</p>
			{props.children}
		</div>
	</div>
);

const FieldLabel = (props: { children: JSX.Element }) => (
	<p class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase sm:text-xs">
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
					checkoutToken: props.checkoutToken,
					paymentNumber: props.paymentNumber,
				});
			},
			// F2: surface failure instead of silently showing transfer
			// instructions as if the reconciler had started.
			onError: () => {
				showToast({
					description: "Төлбөрийн хэлбэр сонгоход алдаа гарлаа. Дахин оролдоно уу.",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
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
			enabled: BANK_TRANSFER_ENABLED && tab() === "transfer" && !advanced(),
			keySuffix: "transfer-tab",
			refetchInterval: 5000,
		},
	);

	createEffect(() => {
		if (advanced() || transferStatusQuery.data?.status !== "success") {
			return;
		}
		setAdvanced(true);
		cart.clearCart();
		void safeNavigate(paymentSuccessUrl(props.paymentNumber, props.checkoutToken));
	});

	return (
		<div class="w-full">
			<Show when={BANK_TRANSFER_ENABLED}>
				<div class="border-border bg-muted/50 mb-4 grid grid-cols-2 gap-1 rounded-full border p-1 sm:mb-6">
					<button
						class="ease-out-quart h-11 rounded-full text-xs font-semibold transition-[background-color,box-shadow,color] duration-200 sm:text-sm"
						classList={{
							"bg-card text-foreground shadow-soft-sm": tab() === "transfer",
							"text-muted-foreground hover:text-foreground": tab() !== "transfer",
						}}
						onClick={() => selectTab("transfer")}
						type="button"
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<Show
								fallback={<IconBank aria-hidden="true" class="h-4 w-4 sm:h-5 sm:w-5" />}
								when={selectTransferMutation.isPending}
							>
								<span
									aria-hidden="true"
									class="working-spinner size-4 rounded-full border-2 border-current/20 border-t-current sm:size-5"
								/>
							</Show>
							<span>{selectTransferMutation.isPending ? "Бэлдэж байна" : "Данс"}</span>
						</span>
					</button>
					<button
						class="ease-out-quart h-11 rounded-full text-xs font-semibold transition-[background-color,box-shadow,color] duration-200 sm:text-sm"
						classList={{
							"bg-card text-foreground shadow-soft-sm": tab() === "qpay",
							"text-muted-foreground hover:text-foreground": tab() !== "qpay",
						}}
						onClick={() => selectTab("qpay")}
						type="button"
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<IconMobile aria-hidden="true" class="h-4 w-4 sm:h-5 sm:w-5" />
							<span>QPay</span>
						</span>
					</button>
				</div>
			</Show>

			<Show when={BANK_TRANSFER_ENABLED && tab() === "transfer"}>
				<div class="animate-payment-panel-left border-border bg-card shadow-soft rounded-2xl border">
					<div class="space-y-5 p-3 sm:space-y-6 sm:p-4">
						{/* F2: surface selectTransfer failure — don't show instructions
						    as if the reconciler started when it never did. */}
						<Show when={selectTransferMutation.isError}>
							<div class="border-destructive/30 bg-destructive/5 flex flex-col items-center gap-3 rounded-xl border p-3 text-center">
								<IconErrorWarning class="text-destructive h-8 w-8" />
								<div>
									<p class="text-destructive text-sm font-semibold">
										Автомат шалгалт эхлэхэд алдаа гарлаа
									</p>
									<p class="text-muted-foreground mt-1 text-xs">
										Төлбөрөө шилжүүлсний дараа доорх товчийг дарж гараар баталгаажуулна уу.
									</p>
								</div>
								<button
									class={cn(buttonVariants({ size: "sm" }))}
									onClick={() => selectTransferMutation.mutate()}
									type="button"
								>
									Дахин оролдох
								</button>
							</div>
						</Show>
						<TransferStep number={1} title="Яг доорх дүнг данс руу шилжүүлнэ үү">
							<div class="bg-muted/30 flex items-center gap-2.5 rounded-xl p-2.5 sm:p-3">
								<div class="border-border bg-background flex size-9 shrink-0 items-center justify-center rounded-full border sm:size-10">
									<img
										alt="Khaan logo"
										class="h-full w-full object-contain p-1.5"
										src="/khaan.png"
									/>
								</div>
								<div class="min-w-0">
									<div class="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
										Банк
									</div>
									<div class="text-foreground truncate text-sm font-semibold sm:text-base">
										{bankTransfer.bankName}
									</div>
								</div>
							</div>

							<div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
								<div class="space-y-1.5">
									<FieldLabel>Дансны дугаар</FieldLabel>
									<div class="flex min-w-0 items-stretch">
										<div class="border-border bg-background min-w-0 flex-1 overflow-hidden rounded-l-xl border px-2.5 py-2.5 font-mono text-sm tracking-wide text-ellipsis sm:px-3 sm:text-base">
											{props.accountNumber ?? bankTransfer.accountNumber}
										</div>
										<CopyFieldButton
											label="Дансны дугаар"
											text={props.accountNumber ?? bankTransfer.accountNumber}
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<FieldLabel>Дүн</FieldLabel>
									<div class="flex min-w-0 items-stretch">
										<div class="border-border bg-wash-lemon text-foreground min-w-0 flex-1 overflow-hidden rounded-l-xl border px-2.5 py-2.5 font-mono text-base text-ellipsis sm:px-3 sm:text-lg">
											{props.total.toLocaleString()}₮
										</div>
										<CopyFieldButton label="Дүн" text={props.total} />
									</div>
								</div>
							</div>

							<div class="space-y-1.5">
								<FieldLabel>Дансны нэр</FieldLabel>
								<div class="border-border bg-background rounded-xl border px-2.5 py-2.5 text-xs leading-tight font-medium sm:px-3 sm:text-sm">
									{props.accountName ?? bankTransfer.accountName}
								</div>
							</div>
						</TransferStep>

						<TransferStep number={2} title="Гүйлгээний утга дээр утасны дугаараа бичнэ үү">
							<div class="space-y-1.5">
								<FieldLabel>Гүйлгээний утга</FieldLabel>
								<div class="flex min-w-0 items-stretch">
									<div class="border-border bg-background min-w-0 flex-1 overflow-hidden rounded-l-xl border px-2.5 py-2.5 font-mono text-sm tracking-wide text-ellipsis sm:px-3 sm:text-base">
										{props.customerPhone}
									</div>
									<CopyFieldButton label="Утасны дугаар" text={props.customerPhone} />
								</div>
							</div>
							<p class="text-muted-foreground text-xs leading-snug sm:text-sm">
								Бид энэ дугаараар таны төлбөрийг автоматаар олж баталгаажуулна.
							</p>
						</TransferStep>

						<TransferStep number={3} title="Шилжүүлсний дараа доорх товчийг дарна уу">
							<p class="text-muted-foreground text-xs leading-snug sm:text-sm">
								Товч дарснаар автомат шалгалт эхэлж, ихэвчлэн хэдхэн минутын дотор баталгаажна.
							</p>
							<ConfirmPaymentButton
								checkoutToken={props.checkoutToken}
								paymentNumber={props.paymentNumber}
							/>
						</TransferStep>
					</div>
				</div>
			</Show>

			<Show when={!BANK_TRANSFER_ENABLED || tab() === "qpay"}>
				<div class="animate-payment-panel-right border-border bg-card shadow-soft rounded-2xl border">
					<div class="p-3 sm:p-5">
						<QpayPaymentPanel
							amount={props.total}
							checkoutToken={props.checkoutToken}
							onChooseTransfer={() => selectTab("transfer")}
							paymentNumber={props.paymentNumber}
						/>
					</div>
				</div>
			</Show>
		</div>
	);
};

export default PaymentOptions;
