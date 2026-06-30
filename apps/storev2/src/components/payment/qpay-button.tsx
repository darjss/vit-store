import { useMutation, useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { trackQpayError } from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconLoader from "~icons/ri/loader-4-line";
import IconQrCode from "~icons/ri/qr-code-line";

interface QpayPaymentPanelProps {
	paymentNumber: string;
	amount?: number;
	checkoutToken?: string;
}

const QpayPaymentPanel = (props: QpayPaymentPanelProps) => {
	const [showQr, setShowQr] = createSignal(false);
	// Guards the success redirect so the polling effect only fires it once.
	// Without this, the 5s refetchInterval re-runs the effect while the
	// previous view transition is still in-flight (or while the tab is hidden
	// after the user switched to a bank app), which throws InvalidStateError.
	const [navigated, setNavigated] = createSignal(false);

	const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;

	onMount(() => {
		setShowQr(isDesktop());
	});

	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.createQr.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				} as { paymentNumber: string });
			},
		}),
		() => queryClient,
	);

	const amountLabel = () => {
		if (typeof props.amount !== "number") {
			return null;
		}
		return `${props.amount.toLocaleString()}₮`;
	};

	const invoiceData = () => mutation.data;

	createEffect(() => {
		if (mutation.isError) {
			trackQpayError(
				props.paymentNumber,
				mutation.error?.message ?? "Unknown error",
			);
		}
	});

	onMount(() => {
		if (!mutation.isSuccess && !mutation.isPending && !mutation.isError) {
			mutation.mutate();
		}
	});

	const paymentStatusQuery = useQuery(
		() => ({
			queryKey: [
				"payment-status",
				props.paymentNumber,
				invoiceData()?.invoice_id,
			],
			queryFn: () =>
				api.payment.getPaymentStatus.query({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				} as { paymentNumber: string }),
			enabled: Boolean(invoiceData()?.invoice_id),
			refetchInterval: 5000,
		}),
		() => queryClient,
	);

	createEffect(() => {
		if (navigated()) return;
		if (paymentStatusQuery.data?.status === "success") {
			setNavigated(true);
			void safeNavigate(
				props.checkoutToken
					? `/payment/success/${props.paymentNumber}?ct=${encodeURIComponent(props.checkoutToken)}`
					: `/payment/success/${props.paymentNumber}`,
			);
		}
	});

	return (
		<div class="flex w-full flex-col items-center gap-4">
			<Show when={mutation.isPending}>
				<div class="flex flex-col items-center gap-3 py-8 text-center">
					<IconLoader class="h-10 w-10 animate-spin text-primary" />
					<p class="font-black text-sm uppercase tracking-wide">
						QPay холболт үүсгэж байна...
					</p>
					<p class="text-muted-foreground text-xs">Түр хүлээнэ үү</p>
				</div>
			</Show>

			<Show when={mutation.isError}>
				<div class="flex flex-col items-center gap-3 py-6">
					<IconErrorWarning class="h-10 w-10 text-destructive" />
					<div class="text-center">
						<p class="font-black text-destructive text-sm uppercase">
							Алдаа гарлаа
						</p>
						<p class="mt-1 text-muted-foreground text-xs">
							{mutation.error?.message ?? "Төлбөр үүсгэхэд алдаа гарлаа"}
						</p>
					</div>
					<button
						type="button"
						onClick={() => mutation.mutate()}
						class="border-3 border-border bg-primary px-4 py-2 font-bold text-sm uppercase shadow-hard transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-hard-sm"
					>
						Дахин оролдох
					</button>
				</div>
			</Show>

			<Show when={mutation.isSuccess && invoiceData()}>
				<div class="w-full space-y-4">
					{/* Amount display */}
					<Show when={amountLabel()}>
						<div class="flex items-center justify-between border-2 border-border bg-secondary/20 px-3 py-2.5">
							<span class="font-bold text-muted-foreground text-xs uppercase">
								Төлөх дүн
							</span>
							<span class="font-black text-lg text-primary">
								{amountLabel()}
							</span>
						</div>
					</Show>

					{/* QR Code toggle */}
					<div class="space-y-3">
						<button
							type="button"
							onClick={() => setShowQr((v) => !v)}
							class="flex w-full items-center justify-center gap-2 border-2 border-border bg-muted/30 px-3 py-2.5 font-bold text-xs uppercase tracking-wide transition-all hover:bg-muted/50"
						>
							<IconQrCode class="h-4 w-4" />
							{showQr() ? "QR код хаах" : "QR код харах"}
						</button>

						<Show when={showQr()}>
							<div class="flex flex-col items-center gap-3 border-2 border-border bg-background p-4">
								<img
									src={`data:image/png;base64,${invoiceData()?.qr_image ?? ""}`}
									alt="QPay QR"
									class="h-48 w-48 object-contain sm:h-56 sm:w-56"
								/>
								<p class="text-center text-[11px] text-muted-foreground">
									QPay апп эсвэл мобайл банк ашиглан QR кодыг уншуулна уу
								</p>
							</div>
						</Show>
					</div>

					{/* Bank deeplinks grid */}
					<Show when={(invoiceData()?.urls?.length ?? 0) > 0}>
						<div class="space-y-3">
							<p class="font-black text-muted-foreground text-xs uppercase tracking-wide">
								Банкаа сонгоно уу
							</p>
							<div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
								<For each={invoiceData()?.urls ?? []}>
									{(link) => (
										<a
											href={link.link}
											class="group flex flex-col items-center gap-1.5 p-1.5 transition-all hover:bg-muted/50 active:scale-95 sm:p-2"
										>
											<div class="h-12 w-12 overflow-hidden border-2 border-border bg-background shadow-hard-sm transition-all group-hover:translate-x-[1px] group-hover:translate-y-[1px] group-hover:shadow-none sm:h-16 sm:w-16">
												<img
													src={link.logo}
													alt={link.name || link.description}
													class="h-full w-full object-contain p-1 sm:p-1.5"
													loading="lazy"
												/>
											</div>
											<span class="line-clamp-2 text-center font-bold text-[10px] leading-tight sm:text-xs">
												{link.name || link.description || "Банк"}
											</span>
										</a>
									)}
								</For>
							</div>
						</div>
					</Show>

					<p class="text-center text-[11px] text-muted-foreground">
						Төлбөр амжилттай хийгдмэгц таны төлөв автоматаар шинэчлэгдэнэ.
					</p>
				</div>
			</Show>
		</div>
	);
};

export default QpayPaymentPanel;
