import { useMutation, useQuery } from "@tanstack/solid-query";
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
	onMount,
	Show,
	Suspense,
	Switch,
} from "solid-js";
import * as v from "valibot";
import EmptyCart from "@/components/cart/empty-cart";
import PaymentOptions from "@/components/payment/payment-options";
import {
	identifyUser,
	trackCheckoutStarted,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import IconPackage from "~icons/ri/archive-line";
import IconChevronDown from "~icons/ri/arrow-down-s-line";
import IconChevronUp from "~icons/ri/arrow-up-s-line";
import IconBankCard from "~icons/ri/bank-card-line";
import IconTruck from "~icons/ri/truck-line";
import { useAppForm } from "../form/form";
import Loading from "../loading";
import { showToast } from "../ui/toast";
import DeliveryInfoSheet from "./delivery-info-sheet";

type DeliveryZone = {
	Id: number;
	zoneName: string;
};

type Step = "delivery" | "payment";

type PaymentInfo = {
	paymentNumber: string;
	checkoutToken?: string;
	total: number;
	orderNumber: string;
	transferReference: string;
};

const CheckoutForm = (props: { user: CustomerSelectType | null }) => {
	onMount(() => {
		if (cart.items().length === 0) return;
		// Only fire once per browser session per cart signature
		const cartSignature = cart.items().map((i) => i.productId).sort().join(",");
		const key = `checkout_started:${cartSignature}`;
		if (sessionStorage.getItem(key)) return;
		sessionStorage.setItem(key, "1");
		trackCheckoutStarted(
			cart.total(),
			cart.count(),
			cart.items().map((item) => item.productId),
		);
	});

	const [step, setStep] = createSignal<Step>("delivery");
	const [paymentInfo, setPaymentInfo] = createSignal<PaymentInfo | null>(null);
	const [summaryOpen, setSummaryOpen] = createSignal(false);
	let checkoutFormEl: HTMLFormElement | undefined;

	const addressZonesQuery = useQuery(
		() => ({
			queryKey: ["delivery-address-zones"],
			queryFn: () => api.order.getDeliveryAddressZones.query(),
			staleTime: 1000 * 60 * 60 * 24,
		}),
		() => queryClient,
	);

	const addressZoneOptions = createMemo(() =>
		((addressZonesQuery.data || []) as DeliveryZone[]).map((zone) => ({
			label: zone.zoneName,
			value: zone.Id,
		})),
	);

	const mutation = useMutation(
		() => ({
			mutationFn: async (values: newOrderType) => {
				return await api.order.addOrder.mutate({ ...values });
			},
			onSuccess: async (data, variables) => {
				const checkoutData = data as typeof data & {
					checkoutToken?: string;
					orderNumber?: string;
					total?: number;
				};
				const paymentNumber = checkoutData?.paymentNumber;
				const checkoutToken = checkoutData?.checkoutToken;

				if (paymentNumber) {
					if (checkoutToken) {
						sessionStorage.setItem(`checkout:${paymentNumber}`, checkoutToken);
					}
					identifyUser(variables.phoneNumber);
					showToast({
						title: "Амжилттай",
						description: "Захиалга амжилттай үүслээ",
						variant: "success",
						duration: 5000,
					});

					// Gather payment details — try server data first, then fallback
					let total = checkoutData?.total ?? cart.total() + deliveryFee;
					let orderNumber = checkoutData?.orderNumber ?? paymentNumber;
					let transferReference = variables.phoneNumber;

					try {
						const details = await api.payment.getPaymentByNumber.query({
							paymentNumber,
							checkoutToken,
						} as { paymentNumber: string });
						total = details.total;
						orderNumber = details.order.orderNumber;
						transferReference = details.order.customerPhone;
					} catch {
						// Fallbacks already set above
					}

					setPaymentInfo({
						paymentNumber,
						checkoutToken,
						total,
						orderNumber,
						transferReference,
					});
					setStep("payment");
					window.scrollTo({ top: 0, behavior: "smooth" });
				} else {
					showToast({
						title: "Алдаа",
						description: "Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
						variant: "error",
						duration: 5000,
					});
				}
			},
			onError: () => {
				showToast({
					title: "Алдаа",
					description: "Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
					variant: "error",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	const form = useAppForm(() => ({
		defaultValues: {
			phoneNumber: props.user?.phone?.toString() || "",
			address: props.user?.address || "",
			addressZoneId: props.user?.addressZoneId || 0,
			notes: "",
		},
		// Keep the submit button enabled even when fields have validation errors.
		// This prevents the silent-button-disabling bug where canSubmit goes false
		// on blur validation but error messages aren't shown yet. Users can always
		// tap submit; invalid attempts trigger onSubmitInvalid which focuses the
		// first invalid field and reveals all errors.
		canSubmitWhenInvalid: true,
		validators: {
			onChange: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(5, "Хаягаа бичнэ үү"),
				),
				addressZoneId: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(1, "Хаягийн бүс сонгоно уу"),
				),
				notes: v.string(),
			}),
			onBlur: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(5, "Хаягаа бичнэ үү"),
				),
				addressZoneId: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(1, "Хаягийн бүс сонгоно уу"),
				),
				notes: v.string(),
			}),
			onSubmit: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(5, "Хаягаа бичнэ үү"),
				),
				addressZoneId: v.pipe(
					v.number(),
					v.integer(),
					v.minValue(1, "Хаягийн бүс сонгоно уу"),
				),
				notes: v.string(),
			}),
		},
		onSubmit: async (values) => {
			const products = cart.items().map((item) => ({
				productId: item.productId,
				quantity: item.quantity,
			}));
			mutation.mutate({ ...values.value, products });
		},
		onSubmitInvalid: () => {
			// Focus the first invalid field so the user can fix it.
			// queueMicrotask lets Solid flush aria-invalid attributes before we query.
			queueMicrotask(() => {
				const invalid = checkoutFormEl?.querySelector<HTMLElement>(
					'[aria-invalid="true"]',
				);
				invalid?.focus();
			});
		},
	}));

	createEffect(() => {
		if (props.user) {
			form.setFieldValue?.("phoneNumber", props.user.phone?.toString() || "");
			form.setFieldValue?.("address", props.user.address || "");
			form.setFieldValue?.("addressZoneId", props.user.addressZoneId || 0);
		}
	});

	const isEmpty = () => cart.items().length === 0;
	const isHydrated = () => cart.isHydrated();
	const totalWithDelivery = () => cart.total() + deliveryFee;

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
		<div class="border border-border shadow-soft-sm">
			<button
				type="button"
				onClick={() => setSummaryOpen((v) => !v)}
				class="flex w-full items-center justify-between gap-3 bg-card p-3 text-left"
			>
				<div class="flex min-w-0 items-center gap-2">
					<IconPackage class="h-5 w-5 shrink-0" />
					<span class="font-extrabold text-sm uppercase">Таны захиалга</span>
					<span class="border border-border bg-primary px-1.5 py-0.5 font-extrabold text-foreground text-xs">
						{cart.count()}
					</span>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<span class="font-extrabold text-foreground text-sm">
						₮{totalWithDelivery().toLocaleString()}
					</span>
					<Show
						when={summaryOpen()}
						fallback={<IconChevronDown class="h-5 w-5 text-muted-foreground" />}
					>
						<IconChevronUp class="h-5 w-5 text-muted-foreground" />
					</Show>
				</div>
			</button>

			<Show when={summaryOpen()}>
				<div class="border-border border-t p-3">
					<div class="max-h-56 space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh-280px)]">
						<For each={cart.items()}>
							{(item) => (
								<div class="flex gap-2.5">
									<div class="h-14 w-14 flex-shrink-0 overflow-hidden border border-border bg-card">
										<a href={`/products/${item.slug}-${item.productId}/`}>
											<Image
												src={item.image}
												alt={`${item.name}`}
												width={56}
												height={56}
												layout="fixed"
												class="h-full w-full object-cover"
											/>
										</a>
									</div>
									<div class="flex min-w-0 flex-1 flex-col justify-between py-0.5">
										<a href={`/products/${item.slug}-${item.productId}/`}>
											<h3 class="line-clamp-2 font-extrabold text-foreground text-xs uppercase leading-tight">
												{item.name}
											</h3>
										</a>
										<div class="flex items-center justify-between gap-2">
											<p class="font-bold text-[10px] text-muted-foreground">
												₮{item.price.toLocaleString()} × {item.quantity}
											</p>
											<p class="font-extrabold text-primary text-xs">
												₮{(item.price * item.quantity).toLocaleString()}
											</p>
										</div>
									</div>
								</div>
							)}
						</For>
					</div>

					<div class="mt-3 space-y-2 border-border border-t pt-3">
						<div class="flex items-center justify-between">
							<p class="font-bold text-muted-foreground text-xs uppercase">
								Бараа
							</p>
							<p class="font-extrabold text-foreground text-sm">
								₮{cart.total().toLocaleString()}
							</p>
						</div>
						<div class="flex items-center justify-between">
							<p class="font-bold text-muted-foreground text-xs uppercase">
								Хүргэлт
							</p>
							<p class="font-extrabold text-foreground text-sm">
								₮{deliveryFee.toLocaleString()}
							</p>
						</div>
						<div class="flex items-center justify-between border-border border-t pt-2">
							<p class="font-extrabold text-foreground text-sm uppercase">Нийт</p>
							<p class="font-extrabold text-foreground text-lg">
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
			<Match when={!isHydrated() && isEmpty()}>
				<Loading />
			</Match>
			<Match when={isHydrated() && isEmpty()}>
				<EmptyCart />
			</Match>
			<Match when={!isEmpty()}>
				<Suspense fallback={<Loading />}>
					<div class="min-h-screen pb-24 md:pb-0">
						{/* Sticky header */}
						<div class="sticky top-0 z-30 border-border border-b bg-background/90 backdrop-blur-sm">
							<div class="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
								<div>
									<h1 class="font-extrabold text-lg uppercase tracking-tight">
										<Show
											when={step() === "payment"}
											fallback={"Захиалга баталгаажуулах"}
										>
											Төлбөр төлөх
										</Show>
									</h1>
									<p class="font-bold text-muted-foreground text-xs">
										<Show
											when={step() === "payment"}
											fallback={"Алхам 1 / 2 — Хүргэлт"}
										>
											Алхам 2 / 2 — Төлбөр
										</Show>
									</p>
								</div>
								<div class="flex gap-1.5">
									<div
										class="h-2 w-8 border border-border"
										classList={{
											"bg-primary": step() === "delivery",
											"bg-muted": step() === "payment",
										}}
									/>
									<div
										class="h-2 w-8 border border-border"
										classList={{
											"bg-primary": step() === "payment",
											"bg-muted": step() === "delivery",
										}}
									/>
								</div>
							</div>
						</div>

						<div class="mx-auto grid max-w-5xl gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
							<div class="order-1 space-y-4">
								{/* Step content */}
								<Switch>
									{/* DELIVERY STEP */}
									<Match when={step() === "delivery"}>
										<div class="border border-border shadow-soft-sm">
											<div class="border-border border-b bg-secondary p-3.5">
												<div class="flex items-center gap-2">
													<div class="flex h-7 w-7 items-center justify-center border border-border bg-primary">
														<IconTruck class="h-3.5 w-3.5 text-foreground" />
													</div>
													<div>
														<h2 class="font-extrabold text-secondary-foreground text-sm uppercase tracking-tight">
															Хүргэлтийн мэдээлэл
														</h2>
														<p class="font-bold text-[10px] text-secondary-foreground/70">
															Бүх талбарыг бөглөнө үү
														</p>
													</div>
												</div>
											</div>

											<div class="p-4">
												<form
													ref={(el) => (checkoutFormEl = el)}
													class="space-y-5"
													onSubmit={async (e) => {
														e.preventDefault();
														e.stopPropagation();
														if (document.activeElement instanceof HTMLElement) {
															document.activeElement.blur();
														}
														await form.handleSubmit();
													}}
												>
													{/* Phone */}
													<form.AppField
														name="phoneNumber"
														children={(field) => (
															<field.FormTextField
																label="Утасны дугаар"
																placeholder="88889999"
																type="tel"
																autoComplete="tel"
																inputMode="numeric"
															/>
														)}
													/>

													{/* Zone + info */}
													<div class="space-y-2">
														<form.AppField
															name="addressZoneId"
															children={(field) => (
																<field.FormSelectField
																	label="Хаягийн бүс"
																	placeholder={
																		addressZonesQuery.isLoading
																			? "Бүсүүд уншиж байна..."
																			: "Хаягийн бүс сонгох"
																	}
																	options={addressZoneOptions()}
																	disabled={addressZonesQuery.isLoading}
																/>
															)}
														/>
													</div>

													{/* Address */}
													<form.AppField
														name="address"
														children={(field) => (
															<field.FormTextArea
																label="Хаяг"
																placeholder="Байр, тоот, давхар"
																autoComplete="street-address"
															/>
														)}
													/>

													{/* Notes */}
													<form.AppField
														name="notes"
														children={(field) => (
															<field.FormTextArea
																label="Нэмэлт мэдээлэл (заавал биш)"
																placeholder="Орцны код, жижүүрт үлдээх гэх мэт"
															/>
														)}
													/>

													{/* Delivery estimate */}
													<div class="flex items-center gap-2.5 rounded-sm bg-muted/50 px-3.5 py-2.5">
														<IconTruck class="h-4 w-4 shrink-0 text-muted-foreground" />
														<p class="text-xs font-medium leading-snug text-muted-foreground">
															<Show when={deliveryEstimate() === "today"} fallback={<>Хүргэлт маргааш 12:00-аас хойш</>}>
																Хүргэлт өнөөдөр 12:00-аас хойш
															</Show>
															<span class="text-foreground/40"> · </span>
															<DeliveryInfoSheet />
														</p>
													</div>

													{/* Submit */}
													<div class="space-y-3 pt-1">
														<div class="flex items-center justify-between border border-border bg-primary p-3.5">
															<div>
																<p class="font-extrabold text-foreground text-sm uppercase">
																	Төлөх дүн
																</p>
																<p class="font-bold text-[10px] text-muted-foreground">
																	Хүргэлтийн хураамж орсон
																</p>
															</div>
															<p class="font-extrabold text-foreground text-xl">
																₮{totalWithDelivery().toLocaleString()}
															</p>
														</div>

														<form.AppForm>
															<div class="w-full">
																<form.SubmitButton size="lg" class="w-full" disabled={mutation.isPending}>
																	{mutation.isPending
																		? "Уншиж байна..."
																		: "Төлбөр төлөх →"}
																</form.SubmitButton>
															</div>
														</form.AppForm>

														<p class="text-center font-bold text-[10px] text-muted-foreground uppercase tracking-wider">
															Дараагийн алхамд төлбөрийн хуудас руу шилжинэ
														</p>
													</div>
												</form>
											</div>
										</div>
									</Match>

									{/* PAYMENT STEP */}
									<Match when={step() === "payment" && paymentInfo()}>
										<div class="border border-border shadow-soft-sm">
											<div class="border-border border-b bg-secondary p-3.5">
												<div class="flex items-center gap-2">
													<div class="flex h-7 w-7 items-center justify-center border border-border bg-primary">
														<IconBankCard class="h-3.5 w-3.5 text-foreground" />
													</div>
													<div>
														<h2 class="font-extrabold text-secondary-foreground text-sm uppercase tracking-tight">
															Төлбөр төлөх
														</h2>
														<p class="font-bold text-[10px] text-secondary-foreground/70">
															Төлбөрийн хэлбэрээ сонгоно уу
														</p>
													</div>
												</div>
											</div>

											<div class="p-4">
												<PaymentOptions
													paymentNumber={paymentInfo()!.paymentNumber}
													total={paymentInfo()!.total}
													transferReference={paymentInfo()!.transferReference}
													checkoutToken={paymentInfo()!.checkoutToken}
												/>
											</div>
										</div>
									</Match>
								</Switch>
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
