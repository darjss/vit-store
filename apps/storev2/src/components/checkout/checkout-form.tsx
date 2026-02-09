import { navigate } from "astro:transitions/client";
import { useMutation } from "@tanstack/solid-query";
import { Image } from "@unpic/solid";
import type { CustomerSelectType, newOrderType } from "@vit/shared";
import { phoneSchema } from "@vit/shared";
import { createEffect, For, Match, onMount, Suspense, Switch } from "solid-js";
import * as v from "valibot";
import EmptyCart from "@/components/cart/empty-cart";
import { trackCheckoutStarted, trackOrderPlaced } from "@/lib/analytics";
import { deliveryFee } from "@/lib/constant";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import { useAppForm } from "../form/form";
import Loading from "../loading";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { showToast } from "../ui/toast";

const CheckoutForm = ({ user }: { user: CustomerSelectType | null }) => {
	onMount(() => {
		if (cart.items().length > 0) {
			trackCheckoutStarted(
				cart.total(),
				cart.count(),
				cart.items().map((item) => item.productId),
			);
		}
	});

	createEffect(() => {
		console.log("user", user);
	});

	const mutation = useMutation(
		() => ({
			mutationFn: async (values: newOrderType) => {
				return await api.order.addOrder.mutate({ ...values });
			},
			onSuccess: async (data) => {
				const paymentNumber = data?.paymentNumber;

				if (paymentNumber) {
					trackOrderPlaced(paymentNumber, cart.count());
				}

				showToast({
					title: "Амжилттай",
					description: "Захиалга амжилттай үүслээ",
					variant: "success",
					duration: 5000,
				});
				navigate(`/payment/${paymentNumber}`);
			},
			onError: (error) => {
				console.error("Order submission error:", error);
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
			phoneNumber: user?.phone.toString() || "",
			address: user?.address || "",
			notes: "",
		},
		validators: {
			onChange: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(15, "Хаяг хамгийн багадаа 15 тэмдэгт байх ёстой"),
				),
				notes: v.string(),
			}),
			onSubmit: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(
					v.string(),
					v.minLength(15, "Хаяг хамгийн багадаа 15 тэмдэгт байх ёстой"),
				),
				notes: v.string(),
			}),
		},
		onSubmit: async (values) => {
			console.log("Submitting");
			const products = cart.items().map((item) => ({
				productId: item.productId,
				quantity: item.quantity,
			}));
			mutation.mutate({ ...values.value, products });
		},
	}));
	createEffect(() => {
		if (user) {
			form.setFieldValue?.("phoneNumber", user.phone?.toString() || "");
			form.setFieldValue?.("address", user.address || "");
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
						<div class="mb-6 border-4 border-border bg-primary p-4 shadow-[6px_6px_0_0_#000]">
							<h1 class="font-black text-xl uppercase tracking-tight">
								Захиалга баталгаажуулах
							</h1>
						</div>

						<div class="space-y-6">
							<Card>
								<CardHeader>
									<CardTitle>Таны захиалга</CardTitle>
								</CardHeader>
								<CardContent>
									<div class="space-y-3">
										<For each={cart.items()}>
											{(item) => (
												<div class="flex gap-3 border-4 border-border bg-secondary/5 p-3 shadow-[4px_4px_0_0_#000]">
													<div class="h-20 w-20 flex-shrink-0 overflow-hidden border-4 border-border bg-card shadow-[2px_2px_0_0_#000]">
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
																₮{item.price.toLocaleString()} × {item.quantity}
															</p>
															<p class="font-black text-primary text-sm">
																₮{(item.price * item.quantity).toLocaleString()}
															</p>
														</div>
													</div>
												</div>
											)}
										</For>
									</div>

									<div class="mt-4 space-y-3 border-border border-t-4 pt-4">
										<div class="flex items-center justify-between">
											<p class="font-bold text-sm uppercase">Дэд дүн</p>
											<p class="font-black text-base">
												₮{cart.total().toLocaleString()}
											</p>
										</div>
										<div class="flex items-center justify-between">
											<p class="font-bold text-sm uppercase">Хүргэлт</p>
											<p class="font-black text-base">
												₮{deliveryFee.toLocaleString()}
											</p>
										</div>
										<div class="border-4 border-border bg-primary/10 p-3 shadow-[4px_4px_0_0_#000]">
											<div class="flex items-center justify-between">
												<p class="font-black text-base uppercase">Нийт дүн</p>
												<p class="font-black text-2xl text-primary">
													₮{(cart.total() + deliveryFee).toLocaleString()}
												</p>
											</div>
										</div>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Хүргэлтийн мэдээлэл</CardTitle>
								</CardHeader>
								<CardContent>
									<form
										class="space-y-4"
										onSubmit={(e) => {
											e.preventDefault();
											e.stopPropagation();
											if (document.activeElement instanceof HTMLElement) {
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
										<div class="pb-6">
											<form.AppForm>
												<form.SubmitButton>
													{mutation.isPending
														? "Уншиж байна..."
														: "Захиалга үүсгэх"}
												</form.SubmitButton>
											</form.AppForm>
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
