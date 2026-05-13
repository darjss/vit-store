import { navigate } from "astro:transitions/client";
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
import {
	identifyUser,
	trackCheckoutStarted,
	trackOrderPlaced,
} from "@/lib/analytics";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import { useAppForm } from "../form/form";
import Loading from "../loading";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { showToast } from "../ui/toast";
import DeliveryInfoSheet from "./delivery-info-sheet";
import IconLock from "~icons/ri/lock-line";
import IconTruck from "~icons/ri/truck-line";
import IconShieldCheck from "~icons/ri/shield-check-line";
import IconSmartphone from "~icons/ri/smartphone-line";
import IconChevronDown from "~icons/ri/arrow-down-s-line";
import IconChevronUp from "~icons/ri/arrow-up-s-line";
import IconPackage from "~icons/ri/archive-line";

type DeliveryZone = {
	Id: number;
	zoneName: string;
};

const CheckoutForm = (props: { user: CustomerSelectType | null }) => {
	onMount(() => {
		if (cart.items().length > 0) {
			trackCheckoutStarted(
				cart.total(),
				cart.count(),
				cart.items().map((item) => item.productId),
			);
		}
	});

	const [summaryOpen, setSummaryOpen] = createSignal(true);

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
				};
				const paymentNumber = checkoutData?.paymentNumber;
				const checkoutToken = checkoutData?.checkoutToken;

				if (paymentNumber) {
					if (checkoutToken) {
						sessionStorage.setItem(
							`checkout:${paymentNumber}`,
							checkoutToken,
						);
					}
					trackOrderPlaced(
						paymentNumber,
						cart.count(),
						cart.total() + deliveryFee,
					);
					identifyUser(variables.phoneNumber);
					showToast({
						title: "Амжилттай",
						description: "Захиалга амжилттай үүслээ",
						variant: "success",
						duration: 5000,
					});

					const targetPath = checkoutToken
						? `/payment/${paymentNumber}?ct=${encodeURIComponent(checkoutToken)}`
						: `/payment/${paymentNumber}`;
					navigate(targetPath, { history: "push" });

					window.setTimeout(() => {
						if (window.location.pathname !== targetPath) {
							window.location.assign(targetPath);
						}
					}, 50);
				} else {
					showToast({
						title: "Алдаа",
						description:
							"Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
						variant: "error",
						duration: 5000,
					});
				}
			},
			onError: () => {
				showToast({
					title: "Алдаа",
					description:
						"Захиалга үүсгэхэд алдаа гарлаа. Дахин оролдоно уу.",
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
		validators: {
			onBlur: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(
						15,
						"Хаяг хамгийн багадаа 15 тэмдэгт байх ёстой",
					),
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
					v.minLength(
						15,
						"Хаяг хамгийн багадаа 15 тэмдэгт байх ёстой",
					),
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
					<div class="min-h-screen bg-background">
						{/* Sticky header with progress */}
						<div class="sticky top-0 z-30 border-b-4 border-border bg-background">
							<div class="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
								<div>
									<h1 class="font-black text-lg uppercase tracking-tight">
										Захиалга баталгаажуулах
									</h1>
									<p class="text-xs font-bold text-muted-foreground">
										Алхам 1 / 2 — Хүргэлт
									</p>
								</div>
								<div class="flex gap-1">
									<div class="h-2.5 w-8 border-2 border-border bg-primary" />
									<div class="h-2.5 w-8 border-2 border-border bg-muted" />
								</div>
							</div>
						</div>

						<div class="mx-auto max-w-lg space-y-4 px-4 py-4">
							{/* Collapsible Order Summary */}
							<div class="border-4 border-border shadow-hard-lg">
								<button
									type="button"
									onClick={() => setSummaryOpen((v) => !v)}
									class="flex w-full items-center justify-between bg-card p-3"
								>
									<div class="flex items-center gap-2">
										<IconPackage class="h-5 w-5" />
										<span class="font-black text-sm uppercase">
											Таны захиалга
										</span>
										<span class="border-2 border-border bg-primary px-1.5 py-0.5 font-black text-xs">
											{cart.count()}
										</span>
									</div>
									<Show
										when={summaryOpen()}
										fallback={
											<IconChevronDown class="h-5 w-5 text-muted-foreground" />
										}
									>
										<IconChevronUp class="h-5 w-5 text-muted-foreground" />
									</Show>
								</button>

								<Show when={summaryOpen()}>
									<div class="border-t-4 border-border p-3">
										<div class="space-y-2">
											<For each={cart.items()}>
												{(item) => (
													<div class="flex gap-2.5">
														<div class="h-16 w-16 flex-shrink-0 overflow-hidden border-3 border-border bg-card">
															<a href={`/product/${item.productId}`}>
																<Image
																	src={item.image}
																	alt={`${item.name}`}
																	width={64}
																	height={64}
																	layout="fixed"
																	class="h-full w-full object-cover"
																/>
															</a>
														</div>
														<div class="flex min-w-0 flex-1 flex-col justify-between py-0.5">
															<a href={`/product/${item.productId}`}>
																<h3 class="line-clamp-2 font-black text-xs uppercase leading-tight">
																	{item.name}
																</h3>
															</a>
															<div class="flex items-center justify-between">
																<p class="font-bold text-muted-foreground text-[10px]">
																	₮
																	{item.price.toLocaleString()}{" "}
																	× {item.quantity}
																</p>
																<p class="font-black text-xs text-primary">
																	₮
																	{(
																		item.price *
																		item.quantity
																	).toLocaleString()}
																</p>
															</div>
														</div>
													</div>
												)}
											</For>
										</div>

										<div class="mt-3 space-y-2 border-t-2 border-border pt-3">
											<div class="flex items-center justify-between">
												<p class="font-bold text-xs uppercase text-muted-foreground">
													Бараа
												</p>
												<p class="font-black text-sm">
													₮{cart.total().toLocaleString()}
												</p>
											</div>
											<div class="flex items-center justify-between">
												<p class="font-bold text-xs uppercase text-muted-foreground">
													Хүргэлт
												</p>
												<p class="font-black text-sm">
													₮{deliveryFee.toLocaleString()}
												</p>
											</div>
											<div class="flex items-center justify-between border-t-2 border-border pt-2">
												<p class="font-black text-sm uppercase">
													Нийт
												</p>
												<p class="font-black text-lg">
													₮{totalWithDelivery().toLocaleString()}
												</p>
											</div>
										</div>
									</div>
								</Show>
							</div>

							{/* Scroll affordance hint */}
							<Show when={summaryOpen()}>
								<div class="flex flex-col items-center gap-1 pb-1 pt-2">
									<p class="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
										Доош гүйлгэж мэдээллээ оруулна уу
									</p>
									<IconChevronDown class="h-5 w-5 animate-bounce text-muted-foreground" />
								</div>
							</Show>

							{/* Delivery Form */}
							<div class="border-4 border-border bg-card shadow-hard-lg">
								<div class="border-b-4 border-border bg-secondary p-3">
									<div class="flex items-center gap-2">
										<div class="flex h-7 w-7 items-center justify-center border-2 border-border bg-primary">
											<IconTruck class="h-3.5 w-3.5 text-secondary-foreground" />
										</div>
										<div>
											<h2 class="font-black text-sm uppercase tracking-tight text-secondary-foreground">
												Хүргэлтийн мэдээлэл
											</h2>
											<p class="text-[10px] font-bold text-secondary-foreground/70">
												Бүх талбарыг бөглөнө үү
											</p>
										</div>
									</div>
								</div>

								<div class="p-3">
									<form
										class="space-y-4"
										onSubmit={(e) => {
											e.preventDefault();
											e.stopPropagation();
											if (
												document.activeElement instanceof
												HTMLElement
											) {
												document.activeElement.blur();
											}
											form.handleSubmit();
										}}
									>
										{/* Phone */}
										<div class="border-3 border-border p-3 shadow-hard-sm">
											<form.AppField
												name="phoneNumber"
												children={(field) => (
													<field.FormTextField
														label="Утасны дугаар"
														placeholder="88889999"
														type="tel"
													/>
												)}
											/>
										</div>

										{/* Zone + info */}
										<div class="border-3 border-border p-3 shadow-hard-sm">
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
												<div class="flex justify-end">
													<DeliveryInfoSheet />
												</div>
											</div>
										</div>

										{/* Address */}
										<div class="border-3 border-border p-3 shadow-hard-sm">
											<form.AppField
												name="address"
												children={(field) => (
													<field.FormTextArea
														label="Хаяг"
														placeholder="Байр, тоот, давхар"
													/>
												)}
											/>
										</div>

										{/* Notes */}
										<div class="border-3 border-border p-3 shadow-hard-sm">
											<form.AppField
												name="notes"
												children={(field) => (
													<field.FormTextArea
														label="Нэмэлт мэдээлэл (заавал биш)"
														placeholder="Орцны код, жижүүрт үлдээх гэх мэт"
													/>
												)}
											/>
										</div>

										{/* Trust badges */}
										<div class="grid grid-cols-2 gap-2">
											<div class="flex items-center gap-2 border-3 border-border bg-primary p-2.5 shadow-hard-sm">
												<IconLock class="h-4 w-4 shrink-0 text-secondary-foreground" />
												<span class="text-[10px] font-black uppercase leading-tight text-secondary-foreground">
													Аюулгүй төлбөр
												</span>
											</div>
											<div class="flex items-center gap-2 border-3 border-border bg-primary p-2.5 shadow-hard-sm">
												<IconShieldCheck class="h-4 w-4 shrink-0 text-secondary-foreground" />
												<span class="text-[10px] font-black uppercase leading-tight text-secondary-foreground">
													Баталгаат бараа
												</span>
											</div>
											<div class="flex items-center gap-2 border-3 border-border bg-secondary p-2.5 shadow-hard-sm">
												<IconTruck class="h-4 w-4 shrink-0 text-secondary-foreground" />
												<span class="text-[10px] font-black uppercase leading-tight text-secondary-foreground">
													Өдөрт нь хүргэнэ
												</span>
											</div>
											<div class="flex items-center gap-2 border-3 border-border bg-secondary p-2.5 shadow-hard-sm">
												<IconSmartphone class="h-4 w-4 shrink-0 text-secondary-foreground" />
												<span class="text-[10px] font-black uppercase leading-tight text-secondary-foreground">
													QPay / Данс
												</span>
											</div>
										</div>

										{/* Submit */}
										<div class="space-y-3 pt-2">
											<div class="flex items-center justify-between border-4 border-border bg-primary/10 p-3 shadow-hard-sm">
												<div>
													<p class="font-black text-sm uppercase">
														Төлөх дүн
													</p>
													<p class="text-[10px] font-bold text-muted-foreground">
														Хүргэлтийн хураамж орсон
													</p>
												</div>
												<p class="font-black text-xl">
													₮{totalWithDelivery().toLocaleString()}
												</p>
											</div>

											<form.AppForm>
												<form.SubmitButton>
													{mutation.isPending
														? "Уншиж байна..."
														: "Төлбөр төлөх →"}
												</form.SubmitButton>
											</form.AppForm>

											<p class="text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
												Дараагийн алхамд төлбөрийн хуудас руу шилжинэ
											</p>
										</div>
									</form>
								</div>
							</div>

							{/* Bottom spacer so content isn't hidden */}
							<div class="h-4" />
						</div>
					</div>
				</Suspense>
			</Match>
		</Switch>
	);
};

export default CheckoutForm;
