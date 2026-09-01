import { useMutation } from "@tanstack/solid-query";
import { Image } from "@unpic/solid";
import type { CustomerSelectType, newOrderType } from "@vit/shared";
import { phoneSchema } from "@vit/shared";
import { deliveryFee } from "@vit/shared/constants";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	Match,
	onCleanup,
	onMount,
	Show,
	Suspense,
	Switch,
} from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { minLength, object, pipe, string } from "valibot";
import EmptyCart from "@/components/cart/empty-cart";
import { identifyUser, trackCheckoutStarted } from "@/lib/analytics";
import { celebrateOnce, orderCreatedCelebrationKey } from "@/lib/celebration";
import { paymentUrl } from "@/lib/payment-url";
import { queryClient } from "@/lib/query";
import { safeNavigate } from "@/lib/safe-navigate";
import { api } from "@/lib/trpc";
import { cart, createCartState } from "@/store/cart";
import {
	BoxIcon as IconPackage,
	AltArrowDownIcon as IconChevronDown,
	AltArrowUpIcon as IconChevronUp,
	DeliveryIcon as IconTruck,
} from "@solar-icons/solid/linear";
import { useAppForm } from "../form/form";
import Loading from "../loading";
import { showToast } from "../ui/toast";
import { WorkingStatus } from "../ui/working-status";
import DeliveryInfoSheet from "./delivery-info-sheet";

type Step = "delivery" | "payment";

const EASE_OUT_QUART: [number, number, number, number] = [0.25, 1, 0.5, 1];
const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];
const stepEnter = { duration: 0.44, easing: EASE_OUT_QUART };
const stepExit = { duration: 0.2, easing: EASE_IN_OUT };

// F12: single checkout validator schema referenced by onChange/onBlur/onSubmit
// instead of three byte-identical tripled copies.
const checkoutValidators = object({
	address: pipe(string(), minLength(5, "Хаягаа бичнэ үү")),
	notes: string(),
	phoneNumber: phoneSchema,
});

const totalWithDelivery = () => cart.total() + deliveryFee;

const CheckoutForm = (props: {
	user:
		| (CustomerSelectType & {
				checkout?: { paymentNumber?: string };
		  })
		| null;
}) => {
	onMount(() => {
		void (async () => {
			if (cart.items().length === 0) {
				return;
			}
			const cartSignature = cart
				.items()
				.map((i) => i.productId)
				.sort()
				.join(",");
			const key = `checkout_started:${cartSignature}`;
			if (sessionStorage.getItem(key)) {
				return;
			}
			sessionStorage.setItem(key, "1");
			trackCheckoutStarted(
				cart.total(),
				cart.count(),
				cart.items().map((item) => item.productId),
			);
		})();
	});

	const [step] = createSignal<Step>("delivery");
	const [summaryOpen, setSummaryOpen] = createSignal(false);
	const [invalidPulse, setInvalidPulse] = createSignal(false);
	let checkoutFormEl: HTMLFormElement | undefined;
	let invalidPulseTimer: number | undefined;

	onCleanup(() => window.clearTimeout(invalidPulseTimer));

	const mutation = useMutation(
		() => ({
			mutationFn: async (values: newOrderType) => {
				return await api.order.addOrder.mutate({ ...values });
			},
			onError: () => {
				showToast({
					description: "Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
					duration: 5000,
					title: "Алдаа",
					variant: "error",
				});
			},
			onSuccess: async (data, variables) => {
				const paymentNumber = data?.paymentNumber;
				if (!paymentNumber) {
					showToast({
						description: "Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
						duration: 5000,
						title: "Алдаа",
						variant: "error",
					});
					return;
				}

				identifyUser(variables.phoneNumber);
				showToast({
					description: "Захиалга амжилттай үүслээ",
					duration: 5000,
					title: "Амжилттай",
					variant: "success",
				});
				celebrateOnce(orderCreatedCelebrationKey(paymentNumber), "light");
				void safeNavigate(paymentUrl(paymentNumber, data.checkoutToken ?? undefined));
			},
		}),
		() => queryClient,
	);

	const form = useAppForm(() => ({
		defaultValues: {
			address: props.user?.address || "",
			notes: "",
			phoneNumber: props.user?.phone?.toString() || "",
		},
		// Keep the submit button enabled even when fields have validation errors.
		// This prevents the silent-button-disabling bug where canSubmit goes false
		// on blur validation but error messages aren't shown yet. Users can always
		// tap submit; invalid attempts trigger onSubmitInvalid which focuses the
		// first invalid field and reveals all errors.
		canSubmitWhenInvalid: true,
		onSubmit: async (values) => {
			const products = cart.items().map((item) => ({
				productId: item.productId,
				quantity: item.quantity,
			}));
			mutation.mutate({ ...values.value, products });
		},
		onSubmitInvalid: () => {
			setInvalidPulse(false);
			requestAnimationFrame(() => setInvalidPulse(true));
			window.clearTimeout(invalidPulseTimer);
			invalidPulseTimer = window.setTimeout(() => setInvalidPulse(false), 450);

			// Focus the first invalid field so the user can fix it.
			// queueMicrotask lets Solid flush aria-invalid attributes before we query.
			queueMicrotask(() => {
				const invalid = checkoutFormEl?.querySelector<HTMLElement>('[aria-invalid="true"]');
				invalid?.focus();
			});
		},
		validators: {
			onBlur: checkoutValidators,
			onChange: checkoutValidators,
			onSubmit: checkoutValidators,
		},
	}));

	createEffect(() => {
		if (props.user) {
			form.setFieldValue?.("phoneNumber", props.user.phone?.toString() || "");
			form.setFieldValue?.("address", props.user.address || "");
		}
	});

	const cartState = createCartState();

	// Delivery estimate: orders before 10:30 Ulaanbaatar time deliver today,
	// otherwise tomorrow. ULAST is UTC+8.
	const deliveryEstimate = createMemo(() => {
		const now = new Date();
		const ulaanbaatarHour = (now.getUTCHours() + 8) % 24;
		const ulaanbaatarMin = now.getUTCMinutes() + ulaanbaatarHour * 60;
		const isBeforeCutoff = ulaanbaatarMin < 10 * 60 + 30;
		return isBeforeCutoff ? "today" : "tomorrow";
	});

	const OrderSummary = () => (
		<div class="border-border bg-card shadow-soft-sm overflow-hidden rounded-2xl border">
			<button
				class="flex w-full items-center justify-between gap-3 p-3.5 text-left"
				onClick={() => setSummaryOpen((v) => !v)}
				type="button"
			>
				<div class="flex min-w-0 items-center gap-2">
					<IconPackage class="text-muted-foreground h-5 w-5 shrink-0" />
					<span class="text-foreground text-sm font-semibold">Таны захиалга</span>
					<span class="bg-primary text-foreground rounded-full px-2 py-0.5 text-xs font-bold tabular-nums">
						{cart.count()}
					</span>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span class="font-display text-foreground text-sm">
						₮{totalWithDelivery().toLocaleString()}
					</span>
					<Show
						fallback={<IconChevronDown class="text-muted-foreground h-5 w-5" />}
						when={summaryOpen()}
					>
						<IconChevronUp class="text-muted-foreground h-5 w-5" />
					</Show>
				</div>
			</button>

			<Show when={summaryOpen()}>
				<div class="enter-fade border-border border-t p-3.5">
					<div class="max-h-56 space-y-2.5 overflow-y-auto pr-1 lg:max-h-[calc(100vh-280px)]">
						<For each={cart.items()}>
							{(item) => (
								<div class="flex gap-2.5">
									<a
										class="bg-muted block size-14 flex-shrink-0 overflow-hidden rounded-lg"
										href={`/products/${item.slug}-${item.productId}/`}
									>
										<Image
											alt={`${item.name}`}
											class="h-full w-full object-cover"
											height={56}
											layout="fixed"
											src={item.image}
											width={56}
										/>
									</a>
									<div class="flex min-w-0 flex-1 flex-col justify-between py-0.5">
										<a href={`/products/${item.slug}-${item.productId}/`}>
											<h3 class="text-foreground line-clamp-2 text-xs leading-tight font-medium">
												{item.name}
											</h3>
										</a>
										<div class="flex items-center justify-between gap-2">
											<p class="text-muted-foreground text-[11px]">
												₮{item.price.toLocaleString()} × {item.quantity}
											</p>
											<p class="text-foreground text-xs font-semibold">
												₮{(item.price * item.quantity).toLocaleString()}
											</p>
										</div>
									</div>
								</div>
							)}
						</For>
					</div>

					<div class="border-border mt-3 space-y-2 border-t pt-3">
						<div class="flex items-center justify-between text-xs">
							<p class="text-muted-foreground">Бараа</p>
							<p class="text-foreground font-medium">₮{cart.total().toLocaleString()}</p>
						</div>
						<div class="flex items-center justify-between text-xs">
							<p class="text-muted-foreground">Хүргэлт</p>
							<p class="text-foreground font-medium">₮{deliveryFee.toLocaleString()}</p>
						</div>
						<div class="border-border flex items-baseline justify-between border-t pt-2">
							<p class="text-foreground text-sm font-semibold">Нийт</p>
							<p class="font-display text-foreground text-lg">
								₮{totalWithDelivery().toLocaleString()}
							</p>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);

	return (
		<Switch>
			<Match when={cartState() === "loading"}>
				<Loading />
			</Match>
			<Match when={cartState() === "empty"}>
				<EmptyCart />
			</Match>
			<Match when={cartState() === "ready"}>
				<Suspense fallback={<Loading />}>
					<div class="min-h-screen pb-24 md:pb-0">
						{/* Sticky header */}
						<div class="border-border bg-background/90 sticky top-0 z-30 border-b backdrop-blur-sm">
							<div class="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
								<div>
									<h1 class="font-display text-foreground text-lg">
										<Show fallback={"Захиалга баталгаажуулах"} when={step() === "payment"}>
											Төлбөр төлөх
										</Show>
									</h1>
									<p class="text-muted-foreground text-xs">
										<Show fallback={"Алхам 1/2 · Хүргэлт"} when={step() === "payment"}>
											Алхам 2/2 · Төлбөр
										</Show>
									</p>
								</div>
								<div class="flex gap-1.5">
									<div class="bg-primary h-1.5 w-8 rounded-full" />
									<div
										class="h-1.5 w-8 rounded-full transition-colors duration-200 ease-out"
										classList={{
											"bg-border": step() === "delivery",
											"bg-primary": step() === "payment",
										}}
									/>
								</div>
							</div>
						</div>

						<div class="mx-auto grid max-w-5xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
							<div class="order-1 space-y-4">
								{/* Step content */}
								<Presence exitBeforeEnter>
									<Switch>
										{/* DELIVERY STEP */}
										<Match when={step() === "delivery"}>
											<Motion.div
												animate={{
													opacity: 1,
													transition: stepEnter,
													x: 0,
												}}
												exit={{
													opacity: 0,
													scale: 0.97,
													transition: stepExit,
													x: -24,
												}}
												initial={{ opacity: 0, scale: 0.97, x: -24 }}
											>
												<div
													class="border-border bg-card shadow-soft overflow-hidden rounded-2xl border"
													classList={{
														"animate-checkout-nudge": invalidPulse(),
													}}
												>
													<div class="border-border flex items-center gap-2.5 border-b px-4 py-3.5">
														<span class="bg-wash-sky flex size-9 shrink-0 items-center justify-center rounded-full">
															<IconTruck aria-hidden="true" class="text-foreground h-4 w-4" />
														</span>
														<div>
															<h2 class="text-foreground text-sm font-semibold">
																Хүргэлтийн мэдээлэл
															</h2>
															<p class="text-muted-foreground text-xs">Бүх талбарыг бөглөнө үү</p>
														</div>
													</div>

													<div class="p-4">
														<form
															class="space-y-5"
															onSubmit={async (e) => {
																e.preventDefault();
																e.stopPropagation();
																const active = document.activeElement;
																if (active && "blur" in active) {
																	// SAFETY: focused form control with blur() is an HTMLElement.
																	(active as HTMLElement).blur();
																}
																await form.handleSubmit();
															}}
															ref={(element) => {
																checkoutFormEl = element;
															}}
														>
															{/* Phone */}
															<form.AppField
																children={(field) => (
																	<field.FormTextField
																		autoComplete="tel"
																		inputMode="numeric"
																		label="Утасны дугаар"
																		placeholder="88889999"
																		type="tel"
																	/>
																)}
																name="phoneNumber"
															/>

															{/* Address */}
															<form.AppField
																children={(field) => (
																	<field.FormTextArea
																		autoComplete="street-address"
																		label="Хаяг"
																		placeholder="Байр, тоот, давхар"
																	/>
																)}
																name="address"
															/>

															{/* Notes */}
															<form.AppField
																children={(field) => (
																	<field.FormTextArea
																		label="Нэмэлт мэдээлэл (заавал биш)"
																		placeholder="Орцны код, жижүүрт үлдээх гэх мэт"
																	/>
																)}
																name="notes"
															/>

															{/* Delivery estimate */}
															<div class="bg-muted/50 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5">
																<IconTruck class="text-muted-foreground h-4 w-4 shrink-0" />
																<p class="text-muted-foreground text-xs leading-snug font-medium">
																	<Show
																		fallback={<>Хүргэлт маргааш 12:00-аас хойш</>}
																		when={deliveryEstimate() === "today"}
																	>
																		Хүргэлт өнөөдөр 12:00-аас хойш
																	</Show>
																	<span class="text-foreground/40"> · </span>
																	<DeliveryInfoSheet />
																</p>
															</div>

															{/* Submit */}
															<div class="space-y-3 pt-1">
																<div class="bg-wash-lemon flex items-center justify-between rounded-xl px-4 py-3">
																	<div>
																		<p class="text-foreground text-sm font-semibold">Төлөх дүн</p>
																		<p class="text-foreground/60 text-xs">
																			Хүргэлтийн хураамж орсон
																		</p>
																	</div>
																	<p class="font-display text-foreground text-xl">
																		₮{totalWithDelivery().toLocaleString()}
																	</p>
																</div>

																<form.AppForm>
																	<div class="w-full">
																		<form.SubmitButton
																			class="w-full"
																			disabled={mutation.isPending}
																			loadingContent={
																				<WorkingStatus
																					icon={<IconTruck />}
																					label="Захиалга үүсгэж байна…"
																				/>
																			}
																			size="lg"
																		>
																			Төлбөр төлөх →
																		</form.SubmitButton>
																	</div>
																</form.AppForm>

																<p class="text-muted-foreground text-center text-xs">
																	Дараагийн алхамд төлбөрийн хуудас руу шилжинэ
																</p>
															</div>
														</form>
													</div>
												</div>
											</Motion.div>
										</Match>
									</Switch>
								</Presence>
							</div>

							<aside class="order-2 lg:sticky lg:top-24">
								<OrderSummary />
							</aside>
						</div>
					</div>
				</Suspense>
			</Match>
		</Switch>
	);
};

export default CheckoutForm;
