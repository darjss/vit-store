import { navigate } from "astro:transitions/client";
import { useMutation, useQuery } from "@tanstack/solid-query";
import { Image } from "@unpic/solid";
import type { CustomerSelectType, newOrderType } from "@vit/shared";
import { phoneSchema } from "@vit/shared";
import { deliveryFee } from "@vit/shared/constants";
import {
	createEffect,
	createMemo,
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
					<div class="min-h-screen bg-background px-4 py-6">
						{/* Header */}
						<div class="mb-6 border-4 border-border bg-primary p-4 shadow-hard-xl">
							<h1 class="font-black text-xl uppercase tracking-tight">
								Захиалга баталгаажуулах
							</h1>
							<p class="mt-1 text-sm font-medium text-foreground/70">
								2 алхам: Хүргэлтийн мэдээлэл оруулах → Төлбөр төлөх
							</p>
						</div>

						<div class="space-y-6">
							{/* Order Summary */}
							<Card>
								<CardHeader>
									<CardTitle>Таны захиалга</CardTitle>
								</CardHeader>
								<CardContent>
									<div class="space-y-3">
										<For each={cart.items()}>
											{(item) => (
												<div class="flex gap-3 border-4 border-border bg-secondary/5 p-3 shadow-hard-lg">
													<div class="h-20 w-20 flex-shrink-0 overflow-hidden border-4 border-border bg-card shadow-hard-sm">
														<a href={`/product/${item.productId}`}>
															<Image
																src={item.image}
																alt={`${item.name}`}
																width={80}
																height={80}
																layout="fixed"
																class="h-full w-full object-cover object-center transition-transform active:scale-95"
															/>
														</a>
													</div>
													<div class="flex flex-1 flex-col justify-between">
														<a href={`/product/${item.productId}`}>
															<h3 class="font-black text-sm uppercase leading-tight transition-colors active:text-primary">
																{item.name}
															</h3>
														</a>
														<div class="flex items-center justify-between">
															<p class="font-bold text-muted-foreground text-xs">
																₮{item.price.toLocaleString()} ×{" "}
																{item.quantity}
															</p>
															<p class="font-black text-primary text-sm">
																₮
																{(
																	item.price * item.quantity
																).toLocaleString()}
															</p>
														</div>
													</div>
												</div>
											)}
										</For>
									</div>

									<div class="mt-4 space-y-3 border-border border-t-4 pt-4">
										<div class="flex items-center justify-between">
											<p class="font-bold text-sm uppercase">
												Дэд дүн
											</p>
											<p class="font-black text-base">
												₮{cart.total().toLocaleString()}
											</p>
										</div>
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-2">
												<IconTruck class="h-4 w-4 text-muted-foreground" />
												<p class="font-bold text-sm uppercase">
													Хүргэлт
												</p>
											</div>
											<p class="font-black text-base">
												₮{deliveryFee.toLocaleString()}
											</p>
										</div>
										<div class="border-4 border-border bg-primary/10 p-3 shadow-hard-lg">
											<div class="flex items-center justify-between">
												<p class="font-black text-base uppercase">
													Нийт дүн
												</p>
												<p class="font-black text-2xl text-primary">
													₮
													{(
														cart.total() + deliveryFee
													).toLocaleString()}
												</p>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* Delivery Form */}
							<Card>
								<CardHeader>
									<div class="flex items-center justify-between">
										<CardTitle>Хүргэлтийн мэдээлэл</CardTitle>
										<span class="inline-flex h-7 w-7 items-center justify-center border-2 border-border bg-primary font-black text-xs">
											1
										</span>
									</div>
								</CardHeader>
								<CardContent>
									<form
										class="space-y-5"
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

										<form.AppField
											name="address"
											children={(field) => (
												<field.FormTextArea
													label="Хаяг"
													placeholder="Байр, тоот, давхар"
												/>
											)}
										/>
										<form.AppField
											name="notes"
											children={(field) => (
												<field.FormTextArea
													label="Нэмэлт мэдээлэл"
													placeholder="Орцны код, жижүүрт үлдээх гэх мэт"
												/>
											)}
										/>

										{/* Trust signals */}
										<div class="grid grid-cols-2 gap-2">
											<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5">
												<IconLock class="h-4 w-4 shrink-0 text-muted-foreground" />
												<span class="text-xs font-bold text-muted-foreground">
													Аюулгүй төлбөр
												</span>
											</div>
											<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5">
												<IconShieldCheck class="h-4 w-4 shrink-0 text-muted-foreground" />
												<span class="text-xs font-bold text-muted-foreground">
													Баталгаат бараа
												</span>
											</div>
											<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5">
												<IconTruck class="h-4 w-4 shrink-0 text-muted-foreground" />
												<span class="text-xs font-bold text-muted-foreground">
													Өдөрт нь хүргэнэ
												</span>
											</div>
											<div class="flex items-center gap-2 border-2 border-border bg-muted/30 p-2.5">
												<IconSmartphone class="h-4 w-4 shrink-0 text-muted-foreground" />
												<span class="text-xs font-bold text-muted-foreground">
													QPay / Данс
												</span>
											</div>
										</div>

										{/* Submit */}
										<div class="space-y-3 pt-2">
											<div class="flex items-center justify-between border-4 border-border bg-primary/10 p-3 shadow-hard-lg">
												<div>
													<p class="font-black text-sm uppercase">
														Төлөх дүн
													</p>
													<p class="text-xs font-medium text-muted-foreground">
														Хүргэлтийн хураамж орсон
													</p>
												</div>
												<p class="font-black text-xl text-primary">
													₮
													{(
														cart.total() + deliveryFee
													).toLocaleString()}
												</p>
											</div>

											<form.AppForm>
												<form.SubmitButton>
													{mutation.isPending
														? "Уншиж байна..."
														: "Төлбөр төлөх рүү үргэлжлүүлэх →"}
												</form.SubmitButton>
											</form.AppForm>

											<p class="text-center text-xs font-medium text-muted-foreground">
												Дараагийн алхамд төлбөрийн хуудсанд шилжих болно
											</p>
										</div>
									</form>
								</CardContent>
							</Card>
						</div>
					</div>
				</Suspense>
			</Match>
		</Switch>
	);
};

export default CheckoutForm;
