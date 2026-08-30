import { DangerCircleIcon as IconErrorWarning } from "@solar-icons/solid/bold";
import {
	QrCodeIcon as IconQrCode,
	Wallet2Icon as IconWallet,
} from "@solar-icons/solid/linear";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { BANK_TRANSFER_ENABLED, supportPhone } from "@vit/shared/constants";
import {
	createEffect,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
} from "solid-js";
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
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/utils";

interface QpayPaymentPanelProps {
	paymentNumber: string;
	amount?: number;
	checkoutToken?: string;
	onChooseTransfer?: () => void;
}

interface BankLogoProps {
	logo?: string;
	name?: string;
	description?: string;
}

interface BankTileProps {
	link: { name: string; description: string; logo: string; link: string };
	onSelect: () => void;
	href?: string;
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

const tileClasses =
	"group flex flex-col items-center gap-1.5 rounded-xl p-1.5 transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted/50 active:scale-[0.97] sm:p-2";

const BankTile = (props: BankTileProps) => {
	const children = (
		<>
			<div class="group-hover:-translate-y-0.5 size-12 overflow-hidden rounded-xl border border-border bg-background shadow-soft-sm transition-[transform,box-shadow] duration-[140ms] ease-out group-hover:shadow-soft sm:size-16">
				<BankLogo
					logo={props.link.logo}
					name={props.link.name}
					description={props.link.description}
				/>
			</div>
			<span class="line-clamp-2 text-center font-medium text-[10px] text-foreground leading-tight sm:text-xs">
				{props.link.name || props.link.description || "Банк"}
			</span>
		</>
	);
	return props.href ? (
		<a href={props.href} onClick={props.onSelect} class={tileClasses}>
			{children}
		</a>
	) : (
		<button type="button" onClick={props.onSelect} class={tileClasses}>
			{children}
		</button>
	);
};

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
	const [handoff, setHandoff] = createSignal<HandoffStateType>(
		HandoffState.idle(),
	);
	const [recoveryReason, setRecoveryReason] = createSignal<
		"no_handoff" | "returned_unpaid" | null
	>(null);
	const recoveryFocusRestore = createSheetFocusRestore();
	// Watcher stops accumulate here because onCleanup inside event handlers
	// never registers: click handlers run outside any Solid reactive owner.
	const stops: Array<() => void> = [];
	onCleanup(() => {
		for (const stop of stops) stop();
	});

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
		stops.push(
			watchHandoff(opening, {
				onOpened: () => {
					trackBankDeeplinkOpened(
						bank,
						props.paymentNumber,
						Date.now() - opening.startedAt,
					);
					setHandoff(HandoffState.opened(bank));
					stops.push(
						watchReturnFromBankApp(() => {
							setHandoff(HandoffState.idle());
							void (async () => {
								if (navigated()) return;
								try {
									const result = await api.payment.checkQpayPayment.mutate(
										{
											paymentNumber: props.paymentNumber,
											checkoutToken: props.checkoutToken,
										},
									);
									if (result.paid) {
										setNavigated(true);
										void safeNavigate(
											paymentSuccessUrl(
												props.paymentNumber,
												props.checkoutToken,
											),
										);
										return;
									}
								} catch {
									// Check failed or invoice is not QPay yet. Fall through
									// to the unpaid recovery sheet.
								}
								if (navigated()) return;
								setRecoveryReason("returned_unpaid");
							})();
						}),
					);
				},
				onFailed: () => {
					trackBankDeeplinkNoHandoff(bank, props.paymentNumber);
					setHandoff(HandoffState.failed(bank));
					setShowQr(true);
					setRecoveryReason("no_handoff");
				},
			}),
		);
	};

	const isDesktop = () =>
		typeof window !== "undefined" &&
		window.matchMedia("(min-width: 640px)").matches;

	onMount(() => {
		setShowQr(isDesktop());
	});

	createEffect(() => {
		const reason = recoveryReason();
		if (!reason) return;
		trackPaymentRecoverySheetShown(props.paymentNumber, reason);
	});

	const chooseRecovery = (choice: "qr" | "transfer" | "dismiss") => {
		if (!recoveryReason()) return;
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

	const failedHandoffBank = () => {
		if (recoveryReason() !== "no_handoff") return null;
		const current = handoff();
		if (!isHandoffState(current, "failed")) return null;
		return current.bank;
	};

	const recoveryCopy = () => {
		const bank = failedHandoffBank();
		if (!bank) {
			return {
				title: "Апп нээгдсэнгүй",
				description: "QPay-ийн банкны апп ажилласангүй. Өөрөөр төлье?",
			};
		}
		if (detectInAppBrowser() === "facebook") {
			return {
				title: `${bank} нээгдсэнгүй`,
				description:
					"Facebook дотор банкны апп ихэвчлэн нээгддэггүй. QR код уншуулж эсвэл дахин оролдоно уу.",
			};
		}
		return {
			title: `${bank} нээгдсэнгүй`,
			description: `${bank} апп нээгдсэнгүй. QR код уншуулж эсвэл өөр банкаар төлнө үү.`,
		};
	};

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
		<>
		<div class="flex w-full flex-col items-center gap-4">
			<Show when={mutation.isPending}>
				<WorkingStatus
					layout="stack"
					class="w-full py-8"
					label="QPay холболт үүсгэж байна"
					hint="Түр хүлээнэ үү"
					icon={<IconQrCode />}
				/>
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
					<div class="space-y-3" ref={qrSection}>
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

					{/* Bank deeplinks grid — scheme links are dead clicks on desktop
					    (no protocol handler), so desktop leads with QR only. */}
					<Show when={(invoiceData()?.urls?.length ?? 0) > 0 && !isDesktop()}>
						<div class="space-y-3">
							<p class="font-semibold text-muted-foreground text-xs">
								Банкаа сонгоно уу
							</p>
							<div class="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
								<For each={invoiceData()?.urls ?? []}>
									{(link) => (
										<BankTile
											link={link}
											href={link.link}
											onSelect={() => handleBankClick(link)}
										/>
									)}
								</For>
							</div>
							<Show when={isHandoffState(handoff(), "opening")}>
								<p class="flex animate-handoff-reveal items-center justify-center gap-2 text-muted-foreground text-xs">
									<span
										class="working-spinner size-3.5 rounded-full border-2 border-current/20 border-t-current"
										aria-hidden="true"
									/>
									Апп нээж байна…
								</p>
							</Show>
						</div>
					</Show>

					<p class="text-center text-[11px] text-muted-foreground">
						Төлбөр амжилттай хийгдмэгц таны төлөв автоматаар шинэчлэгдэнэ.
					</p>

					<p class="text-center text-[11px] text-muted-foreground">
						Төлбөр хийгдэхгүй байвал{" "}
						<a
							href={supportPhone.href}
							class="font-medium text-foreground underline underline-offset-2"
						>
							{supportPhone.display}
						</a>{" "}
						дугаарт холбогдоно уу
					</p>
				</div>
			</Show>
		</div>
		<Sheet
			open={recoveryReason() !== null}
			onOpenChange={(open) => {
				if (!open) {
					chooseRecovery("dismiss");
				}
			}}
		>
			<SheetContent
				position="bottom"
				closeLabel="Хаах"
				focusRestore={recoveryFocusRestore}
				class="flex max-h-[88vh] flex-col rounded-t-2xl border-border border-t bg-card p-0 [transition-timing-function:var(--ease-drawer)] data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
			>
				<SheetHeader class="border-border border-b px-5 pt-1.5 pb-3 text-left">
					<SheetTitle class="font-display font-bold text-lg tracking-tight">
						{recoveryCopy().title}
					</SheetTitle>
					<SheetDescription class="text-muted-foreground text-sm">
						{recoveryCopy().description}
					</SheetDescription>
				</SheetHeader>
				<div class="space-y-2 px-5 py-5">
					<button
						type="button"
						class={cn(buttonVariants())}
						onClick={() => chooseRecovery("qr")}
					>
						QR код уншуулах
					</button>
					<Show when={BANK_TRANSFER_ENABLED && props.onChooseTransfer}>
						<button
							type="button"
							class={cn(buttonVariants({ variant: "dark" }))}
							onClick={() => chooseRecovery("transfer")}
						>
							Дансаар шилжүүлэх
						</button>
					</Show>
					<button
						type="button"
						class="w-full py-2 text-center text-muted-foreground text-xs"
						onClick={() => chooseRecovery("dismiss")}
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
