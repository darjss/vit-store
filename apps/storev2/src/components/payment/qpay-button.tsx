import { DangerCircleIcon as IconErrorWarning } from "@solar-icons/solid/bold";
import {
	QrCodeIcon as IconQrCode,
	Wallet2Icon as IconWallet,
} from "@solar-icons/solid/linear";
import { useMutation, useQuery } from "@tanstack/solid-query";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import {
	trackBankDeeplinkClicked,
	trackBankDeeplinkNoHandoff,
	trackBankDeeplinkOpened,
	trackQpayError,
} from "@/lib/analytics";
import { resolveBankLogo } from "@/lib/bank-logos";
import {
	HandoffState,
	type HandoffState as HandoffStateType,
	isHandoffState,
	watchHandoff,
	watchReturnFromBankApp,
} from "@/lib/deeplink-handoff";
import { paymentSuccessUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface QpayPaymentPanelProps {
	paymentNumber: string;
	amount?: number;
	checkoutToken?: string;
}

interface BankLogoProps {
	logo?: string;
	name?: string;
	description?: string;
}

// QPay hotlinks bank logos from their CDN and most of them 404 in production.
// Prefer a locally mapped asset; otherwise fall back to a generic wallet icon
// when the remote logo fails to load so one broken image never breaks the grid.
const BankLogo = (props: BankLogoProps) => {
	const [failed, setFailed] = createSignal(false);
	const localLogo = () => resolveBankLogo(props.name, props.description);
	const src = () => localLogo() ?? props.logo;

	return (
		<Show
			when={src() && !failed()}
			fallback={
				<IconWallet
					class="h-full w-full p-1 text-muted-foreground sm:p-1.5"
					aria-hidden="true"
				/>
			}
		>
			<img
				src={src()}
				alt={props.name || props.description}
				class="h-full w-full object-contain p-1 sm:p-1.5"
				loading="lazy"
				onError={() => setFailed(true)}
			/>
		</Show>
	);
};

const QpayPaymentPanel = (props: QpayPaymentPanelProps) => {
	const [showQr, setShowQr] = createSignal(false);
	// Guards the success redirect so the polling effect only fires it once.
	// Without this, the 5s refetchInterval re-runs the effect while the
	// previous view transition is still in-flight (or while the tab is hidden
	// after the user switched to a bank app), which throws InvalidStateError.
	const [navigated, setNavigated] = createSignal(false);
	// Bank deep link tap lifecycle: idle → opening → opened | failed. Failed
	// means the bank app never took over (common inside social-app webviews),
	// so we surface QR/transfer as the recovery path.
	const [handoff, setHandoff] = createSignal<HandoffStateType>(
		HandoffState.idle(),
	);

	const handleBankClick = (link: {
		name: string;
		description: string;
		link: string;
	}) => {
		const current = handoff();
		if (!isHandoffState(current, "idle") && !isHandoffState(current, "failed"))
			return;
		const bank = link.name || link.description || "Банк";
		const opening = HandoffState.opening(bank, Date.now());
		setHandoff(opening);
		trackBankDeeplinkClicked(bank, props.paymentNumber);
		const stopWatch = watchHandoff(opening, {
			onOpened: () => {
				trackBankDeeplinkOpened(
					bank,
					props.paymentNumber,
					Date.now() - opening.startedAt,
				);
				setHandoff(HandoffState.opened(bank));
				const stopReturnWatch = watchReturnFromBankApp(() =>
					setHandoff(HandoffState.idle()),
				);
				onCleanup(stopReturnWatch);
			},
			onFailed: () => {
				trackBankDeeplinkNoHandoff(bank, props.paymentNumber);
				setHandoff(HandoffState.failed(bank));
				setShowQr(true);
			},
		});
		onCleanup(stopWatch);
	};

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
							<div class="flex animate-qpay-qr-pop flex-col items-center gap-3 rounded-xl border border-border bg-background p-4">
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
											onClick={() => handleBankClick(link)}
											class="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted/50 active:scale-[0.97] sm:p-2"
										>
											<div class="group-hover:-translate-y-0.5 size-12 overflow-hidden rounded-xl border border-border bg-background shadow-soft-sm transition-[transform,box-shadow] duration-[140ms] ease-out group-hover:shadow-soft sm:size-16">
												<BankLogo
													logo={link.logo}
													name={link.name}
													description={link.description}
												/>
											</div>
											<span class="line-clamp-2 text-center font-medium text-[10px] text-foreground leading-tight sm:text-xs">
												{link.name || link.description || "Банк"}
											</span>
										</a>
									)}
								</For>
							</div>
							<Show when={isHandoffState(handoff(), "opening")}>
								<p class="flex animate-handoff-reveal items-center justify-center gap-2 text-muted-foreground text-xs">
									<span
										class="checkout-loader-ring size-3.5 rounded-full border-2 border-current/20 border-t-current"
										aria-hidden="true"
									/>
									Апп нээж байна…
								</p>
							</Show>
							<Show when={isHandoffState(handoff(), "failed")}>
								<div class="flex animate-handoff-reveal items-start gap-2.5 rounded-xl bg-wash-lemon px-3 py-2.5">
									<p class="text-[11px] text-foreground leading-snug">
										Апп нээгдсэнгүй бол доорх QR кодоор төлж болно, эсвэл "Данс"
										табыг сонгоод гарын үсгээр шилжүүлнэ үү.
									</p>
								</div>
							</Show>
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
