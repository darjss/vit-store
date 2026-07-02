import { useMutation } from "@tanstack/solid-query";
import { bankTransfer } from "@vit/shared/constants";
import { createSignal, Show } from "solid-js";
import { BANK_TRANSFER_ENABLED } from "@vit/shared/constants";
import ConfirmPaymentButton from "@/components/payment/confirm-payment-button";
import CopyFieldButton from "@/components/payment/copy-field-button";
import QpayPaymentPanel from "@/components/payment/qpay-button";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconAlert from "~icons/ri/alert-line";
import IconBank from "~icons/ri/bank-line";
import IconMobile from "~icons/ri/smartphone-line";

interface PaymentOptionsProps {
	paymentNumber: string;
	total: number;
	transferReference: string;
	checkoutToken?: string;
}

const PaymentOptions = (props: PaymentOptionsProps) => {
	const [tab, setTab] = createSignal<"transfer" | "qpay">("qpay");

	const selectTransferMutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.selectTransfer.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				} as { paymentNumber: string });
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
							<IconBank class="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
							<span>Данс</span>
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
				<div class="rounded-2xl border border-border bg-card shadow-soft">
					<div class="space-y-4 p-3 sm:space-y-5 sm:p-4">
						<div class="flex items-center gap-2 rounded-xl bg-muted/30 p-2.5 sm:gap-3 sm:p-3">
							<div class="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background sm:size-12">
								<img
									src="/khaan.png"
									alt="Khaan logo"
									class="h-full w-full object-contain p-1.5 sm:p-2"
								/>
							</div>
							<div>
								<div class="mb-0.5 font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
									Банк
								</div>
								<div class="font-semibold text-foreground text-sm sm:text-base">
									{bankTransfer.bankName}
								</div>
							</div>
						</div>

						<div class="space-y-3">
							<div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
								<div class="space-y-1.5">
									<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
										Данс
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-background px-2.5 py-2.5 font-display text-sm sm:px-3 sm:text-base">
											{bankTransfer.accountNumber}
										</div>
										<CopyFieldButton
											text={bankTransfer.accountNumber}
											label="Данс"
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
										Нэр
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-background px-2.5 py-2.5 font-medium text-xs leading-tight sm:px-3 sm:text-sm">
											{bankTransfer.accountName}
										</div>
										<CopyFieldButton
											text={bankTransfer.accountName}
											label="Нэр"
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
										Дүн
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-wash-lemon px-2.5 py-2.5 font-display text-base text-foreground sm:px-3 sm:text-lg">
											{props.total.toLocaleString()}₮
										</div>
										<CopyFieldButton text={props.total} label="Дүн" />
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-semibold text-[10px] text-muted-foreground uppercase tracking-wider sm:text-xs">
										Төлбөрийн дугаар
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-xl border border-border bg-background px-2.5 py-2.5 font-display text-sm sm:px-3 sm:text-base">
											{props.transferReference}
										</div>
										<CopyFieldButton
											text={props.transferReference}
											label="Төлбөрийн дугаар"
										/>
									</div>
								</div>
							</div>
						</div>

						<div class="rounded-xl bg-warning/40 p-3">
							<div class="flex items-start gap-2.5">
								<div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning">
									<IconAlert
										class="h-3.5 w-3.5 text-warning-foreground"
										aria-hidden="true"
									/>
								</div>
								<div class="flex-1">
									<p class="font-medium text-[11px] text-foreground leading-snug sm:text-xs">
										<strong>Гүйлгээний утга</strong> хэсэгт заавал{" "}
										<strong>{props.transferReference}</strong> төлбөрийн
										дугаарыг бичнэ үү. Төлбөр автоматаар шалгагдах ба
										шаардлагатай үед бид гараар баталгаажуулна.
									</p>
								</div>
							</div>
						</div>

						<ConfirmPaymentButton
							paymentNumber={props.paymentNumber}
							checkoutToken={props.checkoutToken}
						/>
					</div>
				</div>
			</Show>

			<Show when={!BANK_TRANSFER_ENABLED || tab() === "qpay"}>
				<div class="rounded-2xl border border-border bg-card shadow-soft">
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
