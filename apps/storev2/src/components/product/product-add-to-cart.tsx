import { useMutation, useQuery } from "@tanstack/solid-query";
import type { CartItems } from "@vit/shared/types";
import {
	createMemo,
	createSignal,
	Match,
	Show,
	Suspense,
	Switch,
} from "solid-js";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconAlertTriangle from "~icons/ri/error-warning-fill";
import IconNotification from "~icons/ri/notification-3-fill";
import AddToCartButton from "../cart/add-to-cart-button";
import { showToast } from "../ui/toast";

interface ProductQuantitySelectorProps {
	cartItem: CartItems;
}

export default function ProductQuantitySelector(
	props: ProductQuantitySelectorProps,
) {
	const { productId } = props.cartItem;
	const statusQuery = useQuery(
		() => ({
			queryKey: ["is-product-in-stock", productId],
			queryFn: () => api.product.isProductInStock.query({ productId }),
		}),
		() => queryClient,
	);
	const [quantity, setQuantity] = createSignal(1);
	const isInStock = createMemo(() => statusQuery.data?.isInStock);
	const [showNotifyForm, setShowNotifyForm] = createSignal(false);
	const [notifyChannel, setNotifyChannel] = createSignal<"sms" | "email">(
		"sms",
	);
	const [contact, setContact] = createSignal("");
	const stock = createMemo(() => statusQuery?.data?.stock ?? 0);
	const restockMutation = useMutation(
		() => ({
			mutationFn: async (input: {
				productId: number;
				channel: "sms" | "email";
				contact: string;
			}) => {
				return await api.product.subscribeToRestock.mutate(input);
			},
			onSuccess: () => {
				showToast({
					title: "Амжилттай",
					description: "Бараа орж ирэхэд танд мэдэгдэнэ.",
					variant: "success",
					duration: 4000,
				});
				setContact("");
				setShowNotifyForm(false);
			},
			onError: (error) => {
				showToast({
					title: "Алдаа гарлаа",
					description: error.message || "Мэдэгдэл захиалах үед алдаа гарлаа.",
					variant: "destructive",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	const increment = () => {
		const max = Math.min(5, stock());
		if (quantity() >= max) {
			showToast({
				title: "Нэмэх боломжгүй",
				description: "Энэ бүтээгдэхүүнээс илүү тоо хэмжээгээр авах боломжгүй.",
				variant: "destructive",
				duration: 3000,
			});
			return;
		}
		setQuantity((prev) => prev + 1);
	};
	const decrement = () => setQuantity((prev) => Math.max(1, prev - 1));

	const isValidContact = createMemo(() => {
		if (notifyChannel() === "sms") {
			return /^[6-9]\d{7}$/.test(contact().replace(/\D/g, ""));
		}
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact().trim().toLowerCase());
	});

	const submitRestockSubscription = () => {
		restockMutation.mutate({
			productId,
			channel: notifyChannel(),
			contact: contact(),
		});
	};

	return (
		<Suspense fallback={<div>Ачааллаж байна...</div>}>
			<Switch>
				<Match when={isInStock()}>
					<div class="space-y-4">
						<div class="w-full">
							<div class="flex items-center gap-3">
								<button
									type="button"
									onClick={decrement}
									class="flex size-14 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-16 sm:text-3xl"
								>
									−
								</button>
								<div class="flex flex-1 items-center justify-center rounded-sm border-3 border-black bg-white px-6 py-4 font-black text-2xl shadow-[4px_4px_0_0_#000] sm:text-3xl">
									{quantity()}
								</div>
								<button
									type="button"
									onClick={increment}
									class="flex size-14 items-center justify-center rounded-sm border-3 border-black bg-white font-black text-2xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-16 sm:text-3xl"
								>
									+
								</button>
							</div>
						</div>

						<AddToCartButton
							cartItem={{ ...props.cartItem, quantity: quantity() }}
						/>
					</div>
				</Match>
				<Match when={!isInStock()}>
					<div class="space-y-4">
						{/* Out of Stock Alert */}
						<div class="animate-float-slow rounded-sm border-4 border-black bg-destructive/10 p-4 shadow-[6px_6px_0_0_#000] sm:p-6">
							<div class="mb-3 flex items-center gap-3">
								<IconAlertTriangle class="text-2xl text-yellow-500" />
								<h3 class="font-black text-destructive text-lg sm:text-xl">
									Дууссан байна
								</h3>
							</div>
							<p class="font-medium text-muted-foreground text-sm sm:text-base">
								Уучлаарай, энэ бүтээгдэхүүн одоогоор дууссан байна. Та доорх
								товчийг дарж бараа орох үед мэдэгдэл авах боломжтой.
							</p>
						</div>

						{/* Notify Button */}
						<Button
							class="w-full py-6 text-base sm:text-lg"
							onClick={() => setShowNotifyForm((prev) => !prev)}
						>
							<IconNotification class="mr-2 text-yellow-500" />
							Мэдэгдэл авах
						</Button>

						<Show when={showNotifyForm()}>
							<div class="space-y-3 rounded-sm border-4 border-black bg-background p-4 shadow-[6px_6px_0_0_#000]">
								<p class="font-black text-sm uppercase">Мэдэгдэл авах хэлбэр</p>
								<div class="grid grid-cols-2 gap-2">
									<Button
										type="button"
										variant={notifyChannel() === "sms" ? "default" : "outline"}
										onClick={() => {
											setNotifyChannel("sms");
											setContact("");
										}}
									>
										Утас
									</Button>
									<Button
										type="button"
										variant={
											notifyChannel() === "email" ? "default" : "outline"
										}
										onClick={() => {
											setNotifyChannel("email");
											setContact("");
										}}
									>
										Имэйл
									</Button>
								</div>

								<input
									type={notifyChannel() === "sms" ? "tel" : "email"}
									value={contact()}
									onInput={(e) => setContact(e.currentTarget.value)}
									placeholder={
										notifyChannel() === "sms" ? "88889999" : "ner@example.com"
									}
									class="h-12 w-full rounded-sm border-3 border-black bg-white px-4 font-bold text-base shadow-[4px_4px_0_0_#000] focus:outline-none"
								/>

								<Button
									type="button"
									class="w-full"
									onClick={submitRestockSubscription}
									disabled={!isValidContact() || restockMutation.isPending}
								>
									{restockMutation.isPending
										? "Илгээж байна..."
										: "Мэдэгдэл захиалах"}
								</Button>
							</div>
						</Show>
					</div>
				</Match>
			</Switch>
		</Suspense>
	);
}
