import type { CartItems } from "@vit/shared/types";
import { createSignal, Show } from "solid-js";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import IconCheck from "~icons/ri/check-line";
import IconNotification from "~icons/ri/notification-3-fill";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import {
	useInventorySnapshot,
	useInventoryVerification,
} from "./inventory-reconciler";
import RestockNotifySheet from "./restock-notify-sheet";

interface CardAddButtonProps {
	cartItem: CartItems;
	outOfStock?: boolean;
	productName?: string;
	disabled?: boolean;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center transition-[opacity,filter] duration-200 ease-out";

/**
 * The product card's round butter cart button — the card's single Neopop
 * element (shadow-pop-sm, press translates into the shadow). Morphs to a
 * check via blur crossfade after adding. Out-of-stock opens restock notify.
 */
const CardAddButton = (props: CardAddButtonProps) => {
	const [isAdded, setIsAdded] = createSignal(false);
	const [notifyOpen, setNotifyOpen] = createSignal(false);
	const restockSheetFocusRestore = createSheetFocusRestore();
	const inventory = useInventorySnapshot(props.cartItem.productId);
	const verification = useInventoryVerification(props.cartItem.productId);

	const isInventoryVerified = () => verification().status === "verified";
	const isOutOfStock = () =>
		inventory()
			? inventory()?.status !== "active" || (inventory()?.stock ?? 0) <= 0
			: (props.outOfStock ?? false);
	const price = () => inventory()?.price ?? props.cartItem.price;

	const handleAdd = (event: MouseEvent) => {
		if (props.disabled || !isInventoryVerified()) return;
		if (isOutOfStock()) {
			restockSheetFocusRestore.register(event.currentTarget as HTMLElement);
			setNotifyOpen(true);
			return;
		}
		if (isAdded()) return;
		cart.add({ ...props.cartItem, price: price() }, { openDrawer: false });
		setIsAdded(true);
		setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<>
			<button
				type="button"
				onClick={handleAdd}
				disabled={
					props.disabled ||
					!isInventoryVerified() ||
					(!isOutOfStock() && isAdded())
				}
				data-inventory-verification={verification().status}
				aria-label={
					!isInventoryVerified()
						? verification().status === "degraded"
							? "Нөөц баталгаажаагүй"
							: "Нөөц шалгаж байна"
						: isOutOfStock()
							? "Мэдэгдэл авах"
							: "Сагслах"
				}
				class={cn(
					"flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cocoa bg-primary text-primary-foreground shadow-pop-sm transition-[transform,box-shadow,background-color] duration-150 ease-out",
					"active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
					isAdded() && !isOutOfStock() && "bg-success text-success-foreground",
					isOutOfStock() &&
						"border-border bg-card text-foreground shadow-soft-sm",
					!isInventoryVerified() &&
						"border-border bg-muted text-muted-foreground shadow-none",
				)}
			>
				<Show
					when={!isOutOfStock()}
					fallback={<IconNotification class="h-5 w-5" />}
				>
					<span class="grid place-items-center">
						<span
							class={cn(stateClass, isAdded() && "opacity-0 blur-[2px]")}
							aria-hidden={isAdded()}
						>
							<IconShoppingCart class="h-5 w-5" />
						</span>
						<span
							class={cn(stateClass, !isAdded() && "opacity-0 blur-[2px]")}
							aria-hidden={!isAdded()}
						>
							<IconCheck class="h-5 w-5" />
						</span>
					</span>
				</Show>
			</button>
			<Show when={isOutOfStock()}>
				<RestockNotifySheet
					open={notifyOpen()}
					onOpenChange={setNotifyOpen}
					productId={props.cartItem.productId}
					productName={props.productName ?? props.cartItem.name}
					focusRestore={restockSheetFocusRestore}
				/>
			</Show>
		</>
	);
};

export default CardAddButton;
