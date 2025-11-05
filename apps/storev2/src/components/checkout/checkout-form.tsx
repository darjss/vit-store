import { navigate } from "astro:transitions/client";
import { useMutation } from "@tanstack/solid-query";
import { Image } from "@unpic/solid";
import type { newOrderType } from "@vit/shared";
import { phoneSchema } from "@vit/shared";
import { createSignal, For, onMount, Show } from "solid-js";
import * as v from "valibot";
import { deliveryFee } from "@/lib/constant";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { cart } from "@/store/cart";
import { useAppForm } from "../form/form";
import Loading from "../loading";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { showToast } from "../ui/toast";

const CheckoutForm = () => {
	const [isMounted, setIsMounted] = createSignal(false);
	onMount(() => setIsMounted(true));

	const mutation = useMutation(
		() => ({
			mutationFn: async (values: newOrderType) => {
				return await api.order.addOrder.mutate({ ...values });
			},
			onSuccess: async (data) => {
				const paymentId = data?.paymentId;
				showToast({
					title: "Амжилттай",
					description: "Захиалга амжилттай үүслээ",
					variant: "success",
					duration: 5000,
				});
				navigate(`/order/${paymentId}`);
			},
		}),
		() => queryClient,
	);

	const form = useAppForm(() => ({
		defaultValues: {
			phoneNumber: "",
			address: "",
			notes: "",
		},
		validators: {
			onChange: v.object({
				phoneNumber: phoneSchema,
				address: v.pipe(v.string(), v.minLength(15)),
				notes: v.string(),
			}),
		},
		onSubmit: async (values) => {
			const products = cart.items.map((item) => ({
				productId: item.productId,
				quantity: item.quantity,
			}));
			mutation.mutate({ ...values.value, products });
		},
	}));

	return (
		<Show when={isMounted()} fallback={<Loading />}>
			<div class="min-h-screen bg-background px-4 py-6">
				{/* Header */}
				<div class="mb-6 border-4 border-border bg-primary p-4 shadow-[6px_6px_0_0_#000]">
					<h1 class="font-black text-xl uppercase tracking-tight">
						Захиалга баталгаажуулах
					</h1>
				</div>

				<div class="space-y-6">
					{/* Order Summary Card */}
					<Card>
						<CardHeader>
							<CardTitle>Таны захиалга</CardTitle>
						</CardHeader>
						<CardContent>
							<div class="space-y-3">
								<For each={cart.items}>
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

							{/* Price Breakdown */}
							<div class="mt-4 space-y-3 border-border border-t-4 pt-4">
								<div class="flex items-center justify-between">
									<p class="font-bold text-sm uppercase">Дэд дүн</p>
									<p class="font-black text-base">
										₮{cart.total.toLocaleString()}
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
											₮{(cart.total + deliveryFee).toLocaleString()}
										</p>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>

					{/* Delivery Information Card */}
					<Card>
						<CardHeader>
							<CardTitle>Хүргэлтийн мэдээлэл</CardTitle>
						</CardHeader>
						<CardContent>
							<form class="space-y-4" onSubmit={form.handleSubmit}>
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
										<field.FormTextField
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
							</form>
						</CardContent>
					</Card>

					<div class="pb-6">
						<form.AppForm>
							<form.SubmitButton>
								{mutation.isPending ? "Уншиж байна..." : "Захиалга үүсгэх"}
							</form.SubmitButton>
						</form.AppForm>
					</div>
				</div>
			</div>
		</Show>
	);
};

export default CheckoutForm;
