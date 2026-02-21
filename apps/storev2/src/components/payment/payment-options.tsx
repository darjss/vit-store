import { createSignal, Show } from "solid-js";
import ConfirmPaymentButton from "@/components/payment/confirm-payment-button";
import QpayPaymentPanel from "@/components/payment/qpay-button";
import CopyButton from "@/components/ui/copy-button";
import IconAlert from "~icons/ri/alert-line";
import IconBank from "~icons/ri/bank-line";
import IconMobile from "~icons/ri/smartphone-line";

interface PaymentOptionsProps {
	paymentNumber: string;
	total: number;
	orderNumber: string;
}

const PaymentOptions = (props: PaymentOptionsProps) => {
	const [tab, setTab] = createSignal<"transfer" | "qpay">("transfer");

	return (
		<div class="w-full">
			<div class="mb-4 grid grid-cols-2 gap-1.5 border-3 border-border bg-muted/50 p-1.5 shadow-[3px_3px_0_0_#000] sm:mb-6 sm:gap-2 sm:border-4 sm:p-2 sm:shadow-[4px_4px_0_0_#000]">
				<button
					type="button"
					onClick={() => setTab("transfer")}
					class="rounded-sm px-3 py-2.5 font-black text-xs transition-all sm:px-4 sm:py-3 sm:text-sm"
					classList={{
						"border-2 border-black bg-primary shadow-[2px_2px_0_0_#000]":
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
					onClick={() => setTab("qpay")}
					class="rounded-sm px-3 py-2.5 font-black text-xs transition-all sm:px-4 sm:py-3 sm:text-sm"
					classList={{
						"border-2 border-black bg-primary shadow-[2px_2px_0_0_#000]":
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

			<Show when={tab() === "transfer"}>
				<div class="border-3 border-border bg-card shadow-[4px_4px_0_0_rgba(0,0,0,1)] sm:border-4 sm:shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
					<div class="space-y-4 p-3 sm:space-y-5 sm:p-4">
						<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5 sm:gap-3 sm:p-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-border bg-white sm:h-12 sm:w-12">
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
								<div class="font-black text-sm sm:text-base">Хаан банк</div>
							</div>
						</div>

						<div class="space-y-3">
							<div class="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
								<div class="space-y-1.5">
									<label class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Данс
									</label>
									<div class="flex items-stretch">
										<div class="flex-1 rounded-l-sm border-2 border-border bg-white px-2.5 py-2 font-black text-sm sm:px-3 sm:py-2.5 sm:text-base">
											5011147435
										</div>
										<CopyButton text="5011147435" title="Данс" />
									</div>
								</div>

								<div class="space-y-1.5">
									<label class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Нэр
									</label>
									<div class="flex items-stretch">
										<div class="flex-1 rounded-l-sm border-2 border-border bg-white px-2.5 py-2 font-bold text-xs leading-tight sm:px-3 sm:py-2.5 sm:text-sm">
											Batdelger Jigjidsuren
										</div>
										<CopyButton text="Batdelger Jigjidsuren" title="Нэр" />
									</div>
								</div>

								<div class="space-y-1.5">
									<label class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Дүн
									</label>
									<div class="flex items-stretch">
										<div class="flex-1 rounded-l-sm border-2 border-border bg-primary/20 px-2.5 py-2 font-black text-base text-primary sm:px-3 sm:py-2.5 sm:text-lg">
											{props.total.toLocaleString()}₮
										</div>
										<CopyButton text={props.total} title="Дүн" />
									</div>
								</div>

								<div class="space-y-1.5">
									<label class="font-bold text-[10px] text-muted-foreground uppercase sm:text-xs">
										Гүйлгээний утга
									</label>
									<div class="flex items-stretch">
										<div class="flex-1 rounded-l-sm border-2 border-border bg-white px-2.5 py-2 font-black text-sm sm:px-3 sm:py-2.5 sm:text-base">
											{props.orderNumber}
										</div>
										<CopyButton
											text={props.orderNumber}
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
										<strong>{props.orderNumber}</strong> дугаарыг бичнэ үү.
										Төлбөр 5-15 минутын дотор баталгаажна.
									</p>
								</div>
							</div>
						</div>

						<ConfirmPaymentButton paymentNumber={props.paymentNumber} />
					</div>
				</div>
			</Show>

			<Show when={tab() === "qpay"}>
				<div class="border-3 border-border bg-card shadow-[4px_4px_0_0_rgba(0,0,0,1)] sm:border-4 sm:shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
					<div class="p-3 sm:p-5">
						<QpayPaymentPanel
							paymentNumber={props.paymentNumber}
							amount={props.total}
						/>
					</div>
				</div>
			</Show>
		</div>
	);
};

export default PaymentOptions;
