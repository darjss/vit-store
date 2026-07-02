import { useMutation } from "@tanstack/solid-query";
import type { CartItems } from "@vit/shared/types";
import { createMemo, createSignal, Match, Show, Switch } from "solid-js";
import { Button } from "@/components/ui/button";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import IconAlertTriangle from "~icons/ri/error-warning-fill";
import IconNotification from "~icons/ri/notification-3-fill";
import AddToCartButton from "../cart/add-to-cart-button";
import { showToast } from "../ui/toast";

interface ProductQuantitySelectorProps {
	cartItem: CartItems;
	isInStock: boolean;
	stock: number;
}

export default function ProductQuantitySelector(
	props: ProductQuantitySelectorProps,
) {
	const { productId } = props.cartItem;
	const maxStock = props.stock;
	const [quantity, setQuantity] = createSignal(1);
	const [showNotifyForm, setShowNotifyForm] = createSignal(false);
	const [notifyChannel, setNotifyChannel] = createSignal<"sms" | "email">(
		"sms",
	);
	const [contact, setContact] = createSignal("");

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
		const max = Math.min(10, maxStock);
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
		<Switch>
			<Match when={props.isInStock}>
				<div class="flex items-center gap-3">
					<fieldset
						class="inline-flex h-12 shrink-0 items-center rounded-full border border-border bg-background shadow-soft-sm"
						aria-label="Тоо хэмжээ"
					>
						<button
							type="button"
							onClick={decrement}
							class="flex h-12 w-11 items-center justify-center rounded-l-full font-semibold text-foreground text-xl transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40"
							disabled={quantity() <= 1}
							aria-label="Хасах"
						>
							−
						</button>
						<span class="w-8 text-center font-display text-base tabular-nums">
							{quantity()}
						</span>
						<button
							type="button"
							onClick={increment}
							class="flex h-12 w-11 items-center justify-center rounded-r-full font-semibold text-foreground text-xl transition-[background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40"
							aria-label="Нэмэх"
						>
							+
						</button>
					</fieldset>

					<div class="min-w-0 flex-1">
						<AddToCartButton
							cartItem={{ ...props.cartItem, quantity: quantity() }}
						/>
					</div>
				</div>
			</Match>
			<Match when={!props.isInStock}>
				<div class="space-y-4">
					{/* Out of stock note - calm, never alarming */}
					<div class="rounded-2xl bg-sand/40 p-4 sm:p-5">
						<div class="mb-2 flex items-center gap-2.5">
							<IconAlertTriangle class="h-5 w-5 text-cocoa/80" />
							<h3 class="font-semibold text-base text-foreground sm:text-lg">
								Дууссан байна
							</h3>
						</div>
						<p class="text-muted-foreground text-sm leading-relaxed sm:text-base">
							Уучлаарай, энэ бүтээгдэхүүн одоогоор дууссан байна. Та доорх
							товчийг дарж бараа орох үед мэдэгдэл авах боломжтой.
						</p>
					</div>

					{/* Notify Button */}
					<Button
						class="w-full"
						size="lg"
						onClick={() => setShowNotifyForm((prev) => !prev)}
					>
						<IconNotification class="mr-1" />
						Мэдэгдэл авах
					</Button>

					<Show when={showNotifyForm()}>
						<div class="enter-rise space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
							<p class="font-semibold text-sm">Мэдэгдэл авах хэлбэр</p>
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
									variant={notifyChannel() === "email" ? "default" : "outline"}
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
								class="h-12 w-full rounded-xl border border-border bg-background px-4 font-medium text-base shadow-soft-sm transition-[box-shadow,border-color] duration-200 ease-out focus-visible:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
	);
}
