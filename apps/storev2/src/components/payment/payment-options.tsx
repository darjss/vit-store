import { useMutation } from "@tanstack/solid-query";
import { bankTransfer } from "@vit/shared/constants";
import { createSignal, type JSX, Show } from "solid-js";
import { BANK_TRANSFER_ENABLED } from "@vit/shared/constants";
import ConfirmPaymentButton from "@/components/payment/confirm-payment-button";
import CopyFieldButton from "@/components/payment/copy-field-button";
import QpayPaymentPanel from "@/components/payment/qpay-button";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconBank from "~icons/ri/bank-line";
import IconMobile from "~icons/ri/smartphone-line";

interface PaymentOptionsProps {
	paymentNumber: string;
	total: number;
	customerPhone: string;
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
					<div class="space-y-5 p-3 sm:space-y-6 sm:p-4">
						<TransferStep number={1} title="Яг доорх дүнг данс руу шилжүүлнэ үү">
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
											{bankTransfer.accountNumber}
										</div>
										<CopyFieldButton
											text={bankTransfer.accountNumber}
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
									{bankTransfer.accountName}
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
								Бид энэ дугаараар таны төлбөрийг автоматаар олж
								баталгаажуулна.
							</p>
						</TransferStep>

						<TransferStep
							number={3}
							title="Шилжүүлсний дараа доорх товчийг дарна уу"
						>
							<p class="text-muted-foreground text-xs leading-snug sm:text-sm">
								Товч дарснаар автомат шалгалт эхэлж, ихэвчлэн хэдхэн
								минутын дотор баталгаажна.
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
