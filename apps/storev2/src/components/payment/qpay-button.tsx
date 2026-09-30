import { DangerCircleIcon as IconErrorWarning } from "@solar-icons/solid/bold";
import { QrCodeIcon as IconQrCode, Wallet2Icon as IconWallet } from "@solar-icons/solid/linear";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { BANK_TRANSFER_ENABLED, supportPhone } from "@vit/shared/constants";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { WorkingStatus } from "@/components/ui/working-status";
import {
	createSheetFocusRestore,
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	detectInAppBrowser,
	trackBankDeeplinkClicked,
	trackBankDeeplinkNoHandoff,
	trackBankDeeplinkOpened,
	trackPaymentRecoveryChosen,
	trackPaymentRecoverySheetShown,
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
import { isServer } from "@/lib/runtime";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface QpayPaymentPanelProps {
	amount?: number;
	checkoutToken?: string;
	onChooseTransfer?: () => void;
	paymentNumber: string;
}

interface BankLogoProps {
	description?: string;
	logo?: string;
	name?: string;
}

interface BankTileProps {
	href?: string;
	link: { description: string; link: string; logo: string; name: string };
	onSelect: () => void;
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
			fallback={
				<IconWallet aria-hidden="true" class="text-muted-foreground h-full w-full p-1 sm:p-1.5" />
			}
			when={src() && !failed()}
		>
			<img
				alt={props.name || props.description}
				class="h-full w-full object-contain p-1 sm:p-1.5"
				loading="lazy"
				onError={() => setFailed(true)}
				src={src()}
			/>
		</Show>
	);
};

const tileClasses =
	"group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted/50 active:scale-[0.97] sm:p-2";

const BankTile = (props: BankTileProps) => {
	const children = (
		<>
			<div class="border-border bg-background shadow-soft-sm group-hover:shadow-soft size-12 overflow-hidden rounded-xl border transition-[transform,box-shadow] duration-[140ms] ease-out group-hover:-translate-y-0.5 sm:size-16">
				<BankLogo
					description={props.link.description}
					logo={props.link.logo}
					name={props.link.name}
				/>
			</div>
			<span class="text-foreground line-clamp-2 text-center text-[10px] leading-tight font-medium sm:text-xs">
				{props.link.name || props.link.description || "Банк"}
			</span>
		</>
	);
	return props.href ? (
		<a class={tileClasses} href={props.href} onClick={props.onSelect}>
			{children}
		</a>
	) : (
		<button class={tileClasses} onClick={props.onSelect} type="button">
			{children}
		</button>
	);
};

const isDesktop = () => !isServer && window.matchMedia("(min-width: 640px)").matches;

const QpayPaymentPanel = (props: QpayPaymentPanelProps) => {
	const [showQr, setShowQr] = createSignal(false);
	let qrSection: HTMLDivElement | undefined;
	// Guards the success redirect so the polling effect only fires it once.
	// Without this, the 5s refetchInterval re-runs the effect while the
	// previous view transition is still in-flight (or while the tab is hidden
	// after the user switched to a bank app), which throws InvalidStateError.
	const [navigated, setNavigated] = createSignal(false);
	// Bank deep link tap lifecycle: idle → opening → opened | failed. Failed
	// means the bank app never took over (common inside social-app webviews),
	// so we surface QR/transfer as the recovery path.
	const [handoff, setHandoff] = createSignal<HandoffStateType>(HandoffState.idle());
	const [recoveryReason, setRecoveryReason] = createSignal<"no_handoff" | "returned_unpaid" | null>(
		null,
	);
	const recoveryFocusRestore = createSheetFocusRestore();
	// Watcher stops accumulate here because onCleanup inside event handlers
	// never registers: click handlers run outside any Solid reactive owner.
	const stops: Array<() => void> = [];
	onCleanup(() => {
		for (const stop of stops) {
			stop();
		}
	});

	const handleBankClick = (link: { description: string; link: string; name: string }) => {
		const current = handoff();
		if (!isHandoffState(current, "idle") && !isHandoffState(current, "failed")) {
			return;
		}
		const bank = link.name || link.description || "Банк";
		const opening = HandoffState.opening(bank, Date.now());
		setHandoff(opening);
		trackBankDeeplinkClicked(bank, props.paymentNumber);
		stops.push(
			watchHandoff(opening, {
				onFailed: () => {
					trackBankDeeplinkNoHandoff(bank, props.paymentNumber);
					setHandoff(HandoffState.failed(bank));
					setShowQr(true);
					setRecoveryReason("no_handoff");
				},
				onOpened: () => {
					trackBankDeeplinkOpened(bank, props.paymentNumber, Date.now() - opening.startedAt);
					setHandoff(HandoffState.opened(bank));
					stops.push(
						watchReturnFromBankApp(() => {
							setHandoff(HandoffState.idle());
							void (async () => {
								if (navigated()) {
									return;
								}
								try {
									const result = await api.payment.checkQpayPayment.mutate({
										checkoutToken: props.checkoutToken,
										paymentNumber: props.paymentNumber,
									});
									if (result.paid) {
										setNavigated(true);
										void safeNavigate(paymentSuccessUrl(props.paymentNumber, props.checkoutToken));
										return;
									}
								} catch {
									// Check failed or invoice is not QPay yet. Fall through
									// to the unpaid recovery sheet.
								}
								if (navigated()) {
									return;
								}
								setRecoveryReason("returned_unpaid");
							})();
						}),
					);
				},
			}),
		);
	};

	onMount(() => {
		setShowQr(isDesktop());
	});

	createEffect(() => {
		const reason = recoveryReason();
		if (!reason) {
			return;
		}
		trackPaymentRecoverySheetShown(props.paymentNumber, reason);
	});

	const chooseRecovery = (choice: "qr" | "transfer" | "dismiss") => {
		if (!recoveryReason()) {
			return;
		}
		setRecoveryReason(null);
		trackPaymentRecoveryChosen(props.paymentNumber, choice);
		if (choice === "qr") {
			setShowQr(true);
			queueMicrotask(() => {
				qrSection?.scrollIntoView({ behavior: "smooth", block: "center" });
			});
			return;
		}
		if (choice === "transfer") {
			props.onChooseTransfer?.();
		}
	};

	const mutation = useMutation(
		() => ({
			mutationFn: async () => {
				return await api.payment.createQr.mutate({
					checkoutToken: props.checkoutToken,
					paymentNumber: props.paymentNumber,
				});
			},
		}),
		() => queryClient,
	);

	const amountLabel = () => {
		if (!Number.isFinite(props.amount)) {
			return null;
		}
		return `${props.amount.toLocaleString()}₮`;
	};

	const invoiceData = () => mutation.data;

	const failedHandoffBank = () => {
		if (recoveryReason() !== "no_handoff") {
			return null;
		}
		const current = handoff();
		if (!isHandoffState(current, "failed")) {
			return null;
		}
		return current.bank;
	};

	const recoveryCopy = () => {
		const bank = failedHandoffBank();
		if (!bank) {
			return {
				description: "QPay-ийн банкны апп ажилласангүй. Өөрөөр төлье?",
				title: "Апп нээгдсэнгүй",
			};
		}
		if (detectInAppBrowser() === "facebook") {
			return {
				description:
					"Facebook дотор банкны апп ихэвчлэн нээгддэггүй. QR код уншуулж эсвэл дахин оролдоно уу.",
				title: `${bank} нээгдсэнгүй`,
			};
		}
		return {
			description: `${bank} апп нээгдсэнгүй. QR код уншуулж эсвэл өөр банкаар төлнө үү.`,
			title: `${bank} нээгдсэнгүй`,
		};
	};

	createEffect(() => {
		if (mutation.isError) {
			trackQpayError(props.paymentNumber, mutation.error?.message ?? "Unknown error");
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
			enabled: Boolean(invoiceData()?.invoice_id),
			queryFn: () =>
				api.payment.checkQpayPayment.mutate({
					checkoutToken: props.checkoutToken,
					paymentNumber: props.paymentNumber,
				}),
			queryKey: ["qpay-payment-status", props.paymentNumber, invoiceData()?.invoice_id],
			refetchInterval: 5000,
			staleTime: 0,
		}),
		() => queryClient,
	);

	createEffect(() => {
		if (navigated()) {
			return;
		}
		if (paymentStatusQuery.data?.paid) {
			setNavigated(true);
			void safeNavigate(paymentSuccessUrl(props.paymentNumber, props.checkoutToken));
		}
	});

	return (
		<>
			<div class="flex w-full flex-col items-center gap-4">
				<Show when={mutation.isPending}>
					<WorkingStatus
						class="w-full py-8"
						hint="Түр хүлээнэ үү"
						icon={<IconQrCode />}
						label="QPay холболт үүсгэж байна"
						layout="stack"
					/>
				</Show>

				<Show when={mutation.isError}>
					<div class="animate-payment-state-pop flex flex-col items-center gap-3 py-6">
						<IconErrorWarning class="text-destructive h-10 w-10" />
						<div class="text-center">
							<p class="text-destructive text-sm font-semibold">Алдаа гарлаа</p>
							<p class="text-muted-foreground mt-1 text-xs">
								{mutation.error?.message ?? "Төлбөр үүсгэхэд алдаа гарлаа"}
							</p>
						</div>
						<button
							class={cn(buttonVariants({ size: "sm" }))}
							onClick={() => mutation.mutate()}
							type="button"
						>
							Дахин оролдох
						</button>
					</div>
				</Show>

				<Show when={mutation.isSuccess && invoiceData()}>
					<div class="animate-payment-panel-right w-full space-y-4">
						{/* Amount display */}
						<Show when={amountLabel()}>
							<div class="bg-wash-lemon flex items-center justify-between rounded-xl px-3.5 py-2.5">
								<span class="text-foreground/70 text-xs font-semibold">Төлөх дүн</span>
								<span class="font-display text-foreground text-lg">{amountLabel()}</span>
							</div>
						</Show>

						{/* QR Code toggle */}
						<div class="space-y-3" ref={qrSection}>
							<button
								class="border-border bg-muted/30 hover:bg-muted/60 flex h-11 w-full items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold transition-[background-color,transform] duration-[140ms] ease-out active:scale-[0.98]"
								onClick={() => setShowQr((v) => !v)}
								type="button"
							>
								<IconQrCode aria-hidden="true" class="h-4 w-4" />
								{showQr() ? "QR код хаах" : "QR код харах"}
							</button>

							<Show when={showQr()}>
								<div class="animate-qpay-qr-pop border-border bg-background flex flex-col items-center gap-3 rounded-xl border p-4">
									<img
										alt="QPay QR"
										class="h-48 w-48 rounded-lg object-contain sm:h-56 sm:w-56"
										src={`data:image/png;base64,${invoiceData()?.qr_image ?? ""}`}
									/>
									<p class="text-muted-foreground text-center text-[11px]">
										QPay апп эсвэл мобайл банк ашиглан QR кодыг уншуулна уу
									</p>
								</div>
							</Show>
						</div>

						{/* Bank deeplinks grid — scheme links are dead clicks on desktop
					    (no protocol handler), so desktop leads with QR only. */}
						<Show when={(invoiceData()?.urls?.length ?? 0) > 0 && !isDesktop()}>
							<div class="space-y-3">
								<p class="text-muted-foreground text-xs font-semibold">Банкаа сонгоно уу</p>
								<div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
									<For each={invoiceData()?.urls ?? []}>
										{(link) => (
											<BankTile
												href={link.link}
												link={link}
												onSelect={() => handleBankClick(link)}
											/>
										)}
									</For>
								</div>
								<Show when={isHandoffState(handoff(), "opening")}>
									<p class="animate-handoff-reveal text-muted-foreground flex items-center justify-center gap-2 text-xs">
										<span
											aria-hidden="true"
											class="working-spinner size-3.5 rounded-full border-2 border-current/20 border-t-current"
										/>
										Апп нээж байна…
									</p>
								</Show>
							</div>
						</Show>

						<p class="text-muted-foreground text-center text-[11px]">
							Төлбөр амжилттай хийгдмэгц таны төлөв автоматаар шинэчлэгдэнэ.
						</p>

						<p class="text-muted-foreground text-center text-[11px]">
							Төлбөр хийгдэхгүй байвал{" "}
							<a
								class="text-foreground font-medium underline underline-offset-2"
								href={supportPhone.href}
							>
								{supportPhone.display}
							</a>{" "}
							дугаарт холбогдоно уу
						</p>
					</div>
				</Show>
			</div>
			<Sheet
				onOpenChange={(open) => {
					if (!open) {
						chooseRecovery("dismiss");
					}
				}}
				open={recoveryReason() !== null}
			>
				<SheetContent
					class="border-border bg-card flex max-h-[88vh] flex-col rounded-t-2xl border-t p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
					closeLabel="Хаах"
					focusRestore={recoveryFocusRestore}
					position="bottom"
				>
					<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
						<SheetTitle class="font-display text-lg font-bold tracking-tight">
							{recoveryCopy().title}
						</SheetTitle>
						<SheetDescription class="text-muted-foreground text-sm">
							{recoveryCopy().description}
						</SheetDescription>
					</SheetHeader>
					<div class="space-y-2 px-5 py-5">
						<button class={cn(buttonVariants())} onClick={() => chooseRecovery("qr")} type="button">
							QR код уншуулах
						</button>
						<Show when={BANK_TRANSFER_ENABLED && props.onChooseTransfer}>
							<button
								class={cn(buttonVariants({ variant: "dark" }))}
								onClick={() => chooseRecovery("transfer")}
								type="button"
							>
								Дансаар шилжүүлэх
							</button>
						</Show>
						<button
							class="text-muted-foreground w-full py-2 text-center text-xs"
							onClick={() => chooseRecovery("dismiss")}
							type="button"
						>
							Банкаа дахин сонгох
						</button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
};

export default QpayPaymentPanel;
