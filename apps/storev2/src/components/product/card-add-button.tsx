import {
	CheckCircleIcon as IconCheck,
	BellIcon as IconNotification,
} from "@solar-icons/solid/bold";
import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import type { CartItems } from "@vit/shared/types";
import { createSignal, Show } from "solid-js";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import { playCartBurst } from "@/lib/cart-burst";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import { useInventorySnapshot, useInventoryVerification } from "./inventory-reconciler";
import RestockNotifySheet from "./restock-notify-sheet";

interface CardAddButtonProps {
	cartItem: CartItems;
	disabled?: boolean;
	onAdd?: () => void;
	outOfStock?: boolean;
	productName?: string;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center transition-[opacity,filter,transform] duration-[430ms] ease-(--ease-playful-spring)";

const cardAddLabel = (
	verificationStatus: "checking" | "verified" | "degraded",
	outOfStock: boolean,
	added: boolean,
	productName: string,
) => {
	if (verificationStatus === "degraded") {
		return "Нөөц баталгаажаагүй";
	}
	if (verificationStatus === "checking") {
		return "Нөөц шалгаж байна";
	}
	if (outOfStock) {
		return `Мэдэгдэл авах: ${productName}`;
	}
	if (added) {
		return `Сагсанд нэмэгдлээ: ${productName}`;
	}
	return `Сагслах: ${productName}`;
};

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
		if (props.disabled || !isInventoryVerified()) {
			return;
		}
		if (isOutOfStock()) {
			const target = event.currentTarget;
			if (target && "style" in target) {
				// SAFETY: button currentTarget exposes HTMLElement.style.
				restockSheetFocusRestore.register(target as HTMLElement);
			}
			setNotifyOpen(true);
			return;
		}
		if (isAdded()) {
			return;
		}
		props.onAdd?.();
		cart.add({ ...props.cartItem, price: price() }, { openDrawer: false });
		setIsAdded(true);
		const target = event.currentTarget;
		if (target && "style" in target) {
			// SAFETY: button currentTarget exposes HTMLElement.style.
			playCartBurst(target as HTMLElement);
		}
		setTimeout(() => setIsAdded(false), 1500);
	};

	return (
		<>
			<button
				aria-label={cardAddLabel(
					verification().status,
					isOutOfStock(),
					isAdded(),
					props.productName ?? props.cartItem.name,
				)}
				class={cn(
					"border-cocoa bg-primary text-primary-foreground shadow-pop-sm focus-visible:ring-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-[transform,box-shadow,background-color] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
					"active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
					isAdded() &&
						!isOutOfStock() &&
						"animate-cart-add-stamp bg-success text-success-foreground",
					isOutOfStock() && "border-border bg-card text-foreground shadow-soft-sm",
					!isInventoryVerified() && "border-border bg-muted text-muted-foreground shadow-none",
				)}
				data-inventory-verification={verification().status}
				disabled={props.disabled || !isInventoryVerified() || (!isOutOfStock() && isAdded())}
				onClick={handleAdd}
				type="button"
			>
				<Show fallback={<IconNotification class="h-5 w-5" />} when={!isOutOfStock()}>
					<span class="grid place-items-center">
						<span
							aria-hidden={isAdded()}
							class={cn(stateClass, isAdded() && "scale-25 -rotate-[100deg] opacity-0 blur-[2px]")}
						>
							<IconShoppingCart class="h-5 w-5" strokeWidth={2} />
						</span>
						<span
							aria-hidden={!isAdded()}
							class={cn(stateClass, !isAdded() && "scale-25 rotate-[100deg] opacity-0 blur-[2px]")}
						>
							<IconCheck class="h-5 w-5" />
						</span>
					</span>
				</Show>
			</button>
			<Show when={isOutOfStock() && notifyOpen()}>
				<RestockNotifySheet
					focusRestore={restockSheetFocusRestore}
					onOpenChange={setNotifyOpen}
					open={notifyOpen()}
					productId={props.cartItem.productId}
					productName={props.productName ?? props.cartItem.name}
				/>
			</Show>
		</>
	);
};

export default CardAddButton;
