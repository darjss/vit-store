import { useMutation } from "@tanstack/solid-query";
import { bankTransfer } from "@vit/shared/constants";
import { createSignal, Show } from "solid-js";
import { BANK_TRANSFER_ENABLED } from "@vit/shared/constants";
import ConfirmPaymentButton from "@/components/payment/confirm-payment-button";
import QpayPaymentPanel from "@/components/payment/qpay-button";
import CopyButton from "@/components/ui/copy-button";
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
				<div class="mb-4 grid grid-cols-2 gap-1.5 border-3 border-border bg-muted/50 p-1.5 shadow-hard sm:mb-6 sm:gap-2 sm:border-4 sm:p-2 sm:shadow-hard-lg">
					<button
						type="button"
						onClick={() => selectTab("transfer")}
						class="px-3 py-2.5 font-black text-xs transition-all sm:px-4 sm:py-3 sm:text-sm"
						classList={{
							"border-2 border-border bg-primary shadow-hard-sm":
								tab() === "transfer",
							"hover:bg-primary/30": tab() !== "transfer",
						}}
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<IconBank class="h-4 w-4 sm:h-5 sm:w-5" />
							<span>Данс</span>
						</span>
					</button>
					<button
						type="button"
						onClick={() => selectTab("qpay")}
						class="px-3 py-2.5 font-black text-xs transition-all sm:px-4 sm:py-3 sm:text-sm"
						classList={{
							"border-2 border-border bg-primary shadow-hard-sm":
								tab() === "qpay",
							"hover:bg-primary/30": tab() !== "qpay",
						}}
					>
						<span class="flex items-center justify-center gap-1.5 sm:gap-2">
							<IconMobile class="h-4 w-4 sm:h-5 sm:w-5" />
							<span>QPay</span>
						</span>
					</button>
				</div>
			</Show>

			<Show when={BANK_TRANSFER_ENABLED && tab() === "transfer"}>
				<div class="border-3 border-border bg-card shadow-hard-lg sm:border-4 sm:shadow-hard-xl">
					<div class="space-y-4 p-3 sm:space-y-5 sm:p-4">
						<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5 sm:gap-3 sm:p-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-background sm:h-12 sm:w-12">
								<img
									src="/khaan.png"
									alt="Khaan logo"
									class="h-full w-full object-contain p-1.5 sm:p-2"
								/>
							</div>
							<div>
								<div class="mb-0.5 font-bold text-[10px] text-muted-foreground sm:text-xs">
									БАНК
								</div>
								<div class="font-black text-sm sm:text-base">
									{bankTransfer.bankName}
								</div>
							</div>
						</div>

						<div class="space-y-3">
							<div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
								<div class="space-y-1.5">
									<p class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Данс
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-sm border-2 border-border bg-background px-2.5 py-2 font-black text-sm sm:px-3 sm:py-2.5 sm:text-base">
											{bankTransfer.accountNumber}
										</div>
										<CopyButton
											text={bankTransfer.accountNumber}
											title="Данс"
										/>
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Нэр
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-sm border-2 border-border bg-background px-2.5 py-2 font-bold text-xs leading-tight sm:px-3 sm:py-2.5 sm:text-sm">
											{bankTransfer.accountName}
										</div>
										<CopyButton text={bankTransfer.accountName} title="Нэр" />
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Дүн
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-sm border-2 border-border bg-primary/20 px-2.5 py-2 font-black text-base text-primary sm:px-3 sm:py-2.5 sm:text-lg">
											{props.total.toLocaleString()}₮
										</div>
										<CopyButton text={props.total} title="Дүн" />
									</div>
								</div>

								<div class="space-y-1.5">
									<p class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Гүйлгээний утга
									</p>
									<div class="flex min-w-0 items-stretch">
										<div class="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-l-sm border-2 border-border bg-background px-2.5 py-2 font-black text-sm sm:px-3 sm:py-2.5 sm:text-base">
											{props.transferReference}
										</div>
										<CopyButton
											text={props.transferReference}
											title="Гүйлгээний утга"
										/>
									</div>
								</div>
							</div>
						</div>

						<div class="border-2 border-border bg-yellow-50 p-2.5 sm:p-3">
							<div class="flex items-start gap-2 sm:gap-2.5">
								<IconAlert class="h-5 w-5 shrink-0 text-yellow-700" />
								<div class="flex-1">
									<p class="font-bold text-[11px] leading-snug sm:text-xs">
										<strong>Гүйлгээний утга</strong> хэсэгт заавал{" "}
										<strong>{props.transferReference}</strong> утасны дугаарыг
										бичнэ үү. Төлбөр 5-15 минутын дотор баталгаажна.
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
				<div class="border-3 border-border bg-card shadow-hard-lg sm:border-4 sm:shadow-hard-xl">
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
