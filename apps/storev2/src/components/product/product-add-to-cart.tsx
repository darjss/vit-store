import type { CartItems } from "@vit/shared/types";
import { createEffect, createSignal, Match, Switch } from "solid-js";
import { Button } from "@/components/ui/button";
import IconAlertTriangle from "~icons/ri/error-warning-fill";
import IconNotification from "~icons/ri/notification-3-fill";
import AddToCartButton from "../cart/add-to-cart-button";
import { showToast } from "../ui/toast";
import {
	useInventorySnapshot,
	useInventoryVerification,
} from "./inventory-reconciler";
import RestockNotifySheet from "./restock-notify-sheet";

interface ProductQuantitySelectorProps {
	cartItem: CartItems;
	isInStock: boolean;
	stock: number;
}

export default function ProductQuantitySelector(
	props: ProductQuantitySelectorProps,
) {
	const maxStock = props.stock;
	const [quantity, setQuantity] = createSignal(1);
	const [notifyOpen, setNotifyOpen] = createSignal(false);
	const inventory = useInventorySnapshot(props.cartItem.productId);
	const verification = useInventoryVerification(props.cartItem.productId);

	const stock = () => inventory()?.stock ?? maxStock;
	const isInStock = () =>
		inventory()
			? inventory()?.status === "active" && (inventory()?.stock ?? 0) > 0
			: props.isInStock;
	const price = () => inventory()?.price ?? props.cartItem.price;

	createEffect(() => {
		const max = Math.min(10, stock());
		if (max > 0) setQuantity((current) => Math.min(current, max));
	});

	const increment = () => {
		const max = Math.min(10, stock());
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

	return (
		<Switch>
			<Match when={verification().status !== "verified"}>
				<div
					class="rounded-2xl border border-border bg-warning p-4 text-warning-foreground"
					data-inventory-verification={verification().status}
				>
					<div class="flex items-start gap-2.5">
						<IconAlertTriangle
							class="mt-0.5 h-5 w-5 shrink-0"
							aria-hidden="true"
						/>
						<div>
							<p class="font-semibold text-sm">
								{verification().status === "degraded"
									? "Нөөц баталгаажаагүй"
									: "Нөөцийг шалгаж байна"}
							</p>
							<p class="mt-1 text-muted-foreground text-xs leading-relaxed sm:text-sm">
								{verification().status === "degraded"
									? "Шинэ мэдээлэл авах хүртэл сагслах боломжгүй. Дээрх “Дахин шалгах” товчийг ашиглана уу."
									: "Одоогийн нөөц баталгаажмагц сагслах боломжтой болно."}
							</p>
						</div>
					</div>
				</div>
			</Match>
			<Match when={isInStock()}>
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

					<div data-product-main-purchase-action class="min-w-0 flex-1">
						<AddToCartButton
							cartItem={{
								...props.cartItem,
								price: price(),
								quantity: quantity(),
							}}
						/>
					</div>
				</div>
			</Match>
			<Match when={!isInStock()}>
				<div class="space-y-4">
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

					<Button
						data-product-main-purchase-action
						class="w-full"
						size="lg"
						onClick={() => setNotifyOpen(true)}
					>
						<IconNotification class="mr-1" />
						Мэдэгдэл авах
					</Button>

					<RestockNotifySheet
						open={notifyOpen()}
						onOpenChange={setNotifyOpen}
						productId={props.cartItem.productId}
						productName={props.cartItem.name}
					/>
				</div>
			</Match>
		</Switch>
	);
}
