import {
	DangerTriangleIcon as IconAlertTriangle,
	BellIcon as IconNotification,
} from "@solar-icons/solid/bold";
import type { CartItems } from "@vit/shared/types";
import { createEffect, createSignal, Match, Show, Switch } from "solid-js";
import { Button } from "@/components/ui/button";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import AddToCartButton from "../cart/add-to-cart-button";
import { showToast } from "../ui/toast";
import { useInventorySnapshot, useInventoryVerification } from "./inventory-reconciler";
import RestockNotifySheet from "./restock-notify-sheet";

interface ProductQuantitySelectorProps {
	cartItem: CartItems;
	isInStock: boolean;
	stock: number;
}

export default function ProductQuantitySelector(props: ProductQuantitySelectorProps) {
	const maxStock = props.stock;
	const [quantity, setQuantity] = createSignal(1);
	const [notifyOpen, setNotifyOpen] = createSignal(false);
	const restockSheetFocusRestore = createSheetFocusRestore();
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
		if (max > 0) {
			setQuantity((current) => Math.min(current, max));
		}
	});

	const increment = () => {
		const max = Math.min(10, stock());
		if (quantity() >= max) {
			showToast({
				description: "Энэ бүтээгдэхүүнээс илүү тоо хэмжээгээр авах боломжгүй.",
				duration: 3000,
				title: "Нэмэх боломжгүй",
				variant: "destructive",
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
					class="border-border bg-warning text-warning-foreground rounded-2xl border p-4"
					data-inventory-verification={verification().status}
				>
					<div class="flex items-start gap-2.5">
						<IconAlertTriangle aria-hidden="true" class="mt-0.5 h-5 w-5 shrink-0" />
						<div>
							<p class="text-sm font-semibold">
								{verification().status === "degraded"
									? "Нөөц баталгаажаагүй"
									: "Нөөцийг шалгаж байна"}
							</p>
							<p class="text-muted-foreground mt-1 text-xs leading-relaxed sm:text-sm">
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
						aria-label="Тоо хэмжээ"
						class="border-border bg-background shadow-soft-sm inline-flex h-12 shrink-0 items-center rounded-full border"
					>
						<button
							aria-label="Хасах"
							class="text-foreground hover:bg-muted flex h-12 w-11 items-center justify-center rounded-l-full text-xl font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40"
							disabled={quantity() <= 1}
							onClick={decrement}
							type="button"
						>
							−
						</button>
						<span class="font-display w-8 text-center text-base tabular-nums">{quantity()}</span>
						<button
							aria-label="Нэмэх"
							class="text-foreground hover:bg-muted flex h-12 w-11 items-center justify-center rounded-r-full text-xl font-semibold transition-[background-color,transform] duration-150 ease-out active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40"
							onClick={increment}
							type="button"
						>
							+
						</button>
					</fieldset>

					<div class="min-w-0 flex-1" data-product-main-purchase-action>
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
					<div class="bg-sand/40 rounded-2xl p-4 sm:p-5">
						<div class="mb-2 flex items-center gap-2.5">
							<IconAlertTriangle class="text-cocoa/80 h-5 w-5" />
							<h3 class="text-foreground text-base font-semibold sm:text-lg">Дууссан байна</h3>
						</div>
						<p class="text-muted-foreground text-sm leading-relaxed sm:text-base">
							Уучлаарай, энэ бүтээгдэхүүн одоогоор дууссан байна. Та доорх товчийг дарж бараа орох
							үед мэдэгдэл авах боломжтой.
						</p>
					</div>

					<Button
						class="w-full"
						data-product-main-purchase-action
						onClick={(event) => {
							restockSheetFocusRestore.register(event.currentTarget);
							setNotifyOpen(true);
						}}
						size="lg"
					>
						<IconNotification class="mr-1" />
						Мэдэгдэл авах
					</Button>

					<Show when={notifyOpen()}>
						<RestockNotifySheet
							focusRestore={restockSheetFocusRestore}
							onOpenChange={setNotifyOpen}
							open
							productId={props.cartItem.productId}
							productName={props.cartItem.name}
						/>
					</Show>
				</div>
			</Match>
		</Switch>
	);
}
