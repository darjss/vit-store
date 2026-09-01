import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import { formatCurrency } from "@vit/shared";
import type { CartItems } from "@vit/shared/types";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Button } from "@/components/ui/button";
import { createSheetFocusRestore } from "@/components/ui/sheet";
import { cart } from "@/store/cart";
import { useInventorySnapshot, useInventoryVerification } from "./inventory-reconciler";
import RestockNotifySheet from "./restock-notify-sheet";

interface StickyMobileCtaProps {
	cartItem: CartItems;
	isInStock: boolean;
}

export default function StickyMobileCta(props: StickyMobileCtaProps) {
	const [visible, setVisible] = createSignal(false);
	const inventory = useInventorySnapshot(props.cartItem.productId);
	const verification = useInventoryVerification(props.cartItem.productId);
	const [notifyOpen, setNotifyOpen] = createSignal(false);
	const restockSheetFocusRestore = createSheetFocusRestore();
	const isInStock = () =>
		inventory()
			? inventory()?.status === "active" && (inventory()?.stock ?? 0) > 0
			: props.isInStock;
	const price = () => inventory()?.price ?? props.cartItem.price;

	onMount(() => {
		const mainCta = document.getElementById("product-main-cta");
		const stackMeasure = document.querySelector<HTMLElement>(
			"[data-mobile-purchase-stack-measure]",
		);
		if (!mainCta || !stackMeasure) {
			return;
		}

		let observer: IntersectionObserver | undefined;
		const observePurchaseAction = () => {
			observer?.disconnect();

			const action =
				mainCta.querySelector<HTMLElement>("[data-product-main-purchase-action]") ?? mainCta;
			const stackHeight = stackMeasure.getBoundingClientRect().height;

			observer = new IntersectionObserver(
				([entry]) => {
					// Handoff only after the complete main action clears both fixed layers.
					setVisible(entry.intersectionRatio < 1);
				},
				{
					rootMargin: `0px 0px -${stackHeight}px 0px`,
					threshold: 1,
				},
			);
			observer.observe(action);
		};

		observePurchaseAction();
		window.addEventListener("resize", observePurchaseAction);
		const actionObserver = new MutationObserver(observePurchaseAction);
		actionObserver.observe(mainCta, { childList: true, subtree: true });
		onCleanup(() => {
			observer?.disconnect();
			actionObserver.disconnect();
			window.removeEventListener("resize", observePurchaseAction);
		});
	});

	const handleAdd = (event: MouseEvent) => {
		if (verification().status !== "verified") {
			return;
		}
		if (!isInStock()) {
			restockSheetFocusRestore.register(event.currentTarget as HTMLElement);
			setNotifyOpen(true);
			return;
		}
		cart.add({ ...props.cartItem, price: price() }, { openDrawer: true });
	};

	return (
		<>
			<div
				aria-hidden="true"
				class="pointer-events-none invisible fixed inset-x-0 bottom-0 h-[var(--mobile-purchase-stack-height)] md:hidden"
				data-mobile-purchase-stack-measure
			/>
			<Presence>
				<Show when={visible()}>
					<Motion.div
						animate={{ opacity: 1, y: 0 }}
						class="border-border bg-card shadow-soft-lg fixed inset-x-3 bottom-[var(--mobile-purchase-offset)] z-50 h-[var(--mobile-purchase-height)] rounded-full border px-4 py-2 md:hidden"
						data-pdp-sticky-cta
						exit={{ opacity: 0, y: 24 }}
						initial={{ opacity: 0, y: 24 }}
						transition={{ duration: 0.3, easing: [0.23, 1, 0.32, 1] }}
					>
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 pl-1">
								<p class="text-muted-foreground truncate text-xs">{props.cartItem.name}</p>
								<p class="font-display text-foreground text-base">{formatCurrency(price())}</p>
							</div>
							<Button
								class="shrink-0"
								data-inventory-verification={verification().status}
								disabled={verification().status !== "verified"}
								onClick={handleAdd}
								size="default"
								type="button"
							>
								<Show
									fallback={
										<span>
											{verification().status === "degraded"
												? "Нөөц баталгаажаагүй"
												: "Нөөц шалгаж байна"}
										</span>
									}
									when={verification().status === "verified"}
								>
									<Show fallback={<span>Дууссан</span>} when={isInStock()}>
										<IconShoppingCart class="h-4 w-4" strokeWidth={2} />
										Сагслах
									</Show>
								</Show>
							</Button>
						</div>
					</Motion.div>
				</Show>
			</Presence>
			<Show when={notifyOpen()}>
				<RestockNotifySheet
					focusRestore={restockSheetFocusRestore}
					onOpenChange={setNotifyOpen}
					open
					productId={props.cartItem.productId}
					productName={props.cartItem.name}
				/>
			</Show>
		</>
	);
}
