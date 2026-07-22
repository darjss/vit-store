import { useMutation, useQuery } from "@tanstack/solid-query";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { trackQpayError } from "@/lib/analytics";
import { paymentSuccessUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { QrCodeIcon as IconQrCode } from "@solar-icons/solid/linear";
import { DangerCircleIcon as IconErrorWarning } from "@solar-icons/solid/bold";

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

	const isDesktop = () =>
		typeof window !== "undefined" &&
		window.matchMedia("(min-width: 640px)").matches;

	onMount(() => {
		setShowQr(isDesktop());
	});

	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.createQr.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				});
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

	// Reconcile against QPay while this page is open instead of only polling
	// our database. The webhook remains the primary confirmation path, but QPay
	// callbacks can be delayed or missed; this authenticated fallback verifies
	// the invoice and runs the same idempotent confirmation boundary.
	const paymentStatusQuery = useQuery(
		() => ({
			queryKey: [
				"qpay-payment-status",
				props.paymentNumber,
				invoiceData()?.invoice_id,
			],
			queryFn: () =>
				api.payment.checkQpayPayment.mutate({
					paymentNumber: props.paymentNumber,
					checkoutToken: props.checkoutToken,
				}),
			enabled: Boolean(invoiceData()?.invoice_id),
			refetchInterval: 5000,
			staleTime: 0,
		}),
		() => queryClient,
	);

	createEffect(() => {
		if (navigated()) return;
		if (paymentStatusQuery.data?.paid) {
			setNavigated(true);
			void safeNavigate(
				paymentSuccessUrl(props.paymentNumber, props.checkoutToken),
			);
		}
	});

	return (
		<div class="flex w-full flex-col items-center gap-4">
			<Show when={mutation.isPending}>
				<div class="flex animate-payment-state-pop flex-col items-center gap-3 py-8 text-center">
					<div
						class="relative grid size-16 place-items-center text-cocoa"
						aria-hidden="true"
					>
						<svg class="absolute inset-0 size-16" viewBox="0 0 64 64">
							<title>QPay холболт үүсгэж байна</title>
							<circle
								cx="32"
								cy="32"
								r="25"
								fill="none"
								stroke="currentColor"
								stroke-opacity="0.16"
								stroke-width="4"
							/>
							<path
								class="checkout-loader-ring"
								d="M32 7a25 25 0 0 1 25 25"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-width="5"
							/>
							<path
								class="checkout-loader-ring-slow"
								d="M32 16a16 16 0 0 0-16 16"
								fill="none"
								stroke="currentColor"
								stroke-linecap="round"
								stroke-width="3"
							/>
						</svg>
						<IconQrCode class="size-6" />
					</div>
					<p class="font-semibold text-foreground text-sm">
						QPay холболт үүсгэж байна
					</p>
					<span class="flex gap-1.5 text-cocoa" aria-hidden="true">
						<i class="checkout-loader-dot size-2 rounded-full bg-current" />
						<i class="checkout-loader-dot size-2 rounded-full bg-current" />
						<i class="checkout-loader-dot size-2 rounded-full bg-current" />
					</span>
					<p class="text-muted-foreground text-xs">Түр хүлээнэ үү</p>
				</div>
			</Show>

			<Show when={mutation.isError}>
				<div class="flex animate-payment-state-pop flex-col items-center gap-3 py-6">
					<IconErrorWarning class="h-10 w-10 text-destructive" />
					<div class="text-center">
						<p class="font-semibold text-destructive text-sm">Алдаа гарлаа</p>
						<p class="mt-1 text-muted-foreground text-xs">
							{mutation.error?.message ?? "Төлбөр үүсгэхэд алдаа гарлаа"}
						</p>
					</div>
					<button
						type="button"
						onClick={() => mutation.mutate()}
						class={cn(buttonVariants({ size: "sm" }))}
					>
						Дахин оролдох
					</button>
				</div>
			</Show>

			<Show when={mutation.isSuccess && invoiceData()}>
				<div class="w-full animate-payment-panel-right space-y-4">
					{/* Amount display */}
					<Show when={amountLabel()}>
						<div class="flex items-center justify-between rounded-xl bg-wash-lemon px-3.5 py-2.5">
							<span class="font-semibold text-foreground/70 text-xs">
								Төлөх дүн
							</span>
							<span class="font-display text-foreground text-lg">
								{amountLabel()}
							</span>
						</div>
					</Show>

					{/* QR Code toggle */}
					<div class="space-y-3">
						<button
							type="button"
							onClick={() => setShowQr((v) => !v)}
							class="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-muted/30 px-3 font-semibold text-xs transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted/60 active:scale-[0.98]"
						>
							<IconQrCode class="h-4 w-4" aria-hidden="true" />
							{showQr() ? "QR код хаах" : "QR код харах"}
						</button>

						<Show when={showQr()}>
							<div class="animate-qpay-qr-pop flex flex-col items-center gap-3 rounded-xl border border-border bg-background p-4">
								<img
									src={`data:image/png;base64,${invoiceData()?.qr_image ?? ""}`}
									alt="QPay QR"
									class="h-48 w-48 rounded-lg object-contain sm:h-56 sm:w-56"
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
							<p class="font-semibold text-muted-foreground text-xs">
								Банкаа сонгоно уу
							</p>
							<div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
								<For each={invoiceData()?.urls ?? []}>
									{(link) => (
										<a
											href={link.link}
											class="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted/50 active:scale-[0.97] sm:p-2"
										>
											<div class="group-hover:-translate-y-0.5 size-12 overflow-hidden rounded-xl border border-border bg-background shadow-soft-sm transition-[transform,box-shadow] duration-[140ms] ease-out group-hover:shadow-soft sm:size-16">
												<img
													src={link.logo}
													alt={link.name || link.description}
													class="h-full w-full object-contain p-1 sm:p-1.5"
													loading="lazy"
												/>
											</div>
											<span class="line-clamp-2 text-center font-medium text-[10px] text-foreground leading-tight sm:text-xs">
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
