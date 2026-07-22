import { deliveryFee } from "@vit/shared/constants";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import IconArrowRight from "~icons/ri/arrow-right-line";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import CartCrossSells from "./cart-cross-sells";
import CartDrawerItem from "./cart-drawer-item";
import { cartSheetFocusRestore } from "./cart-sheet-focus";
import EmptyCart from "./empty-cart";

const CartDrawer = () => {
	const [totalPulse, setTotalPulse] = createSignal(false);
	const isEmpty = () => cart.items().length === 0;
	let totalPulseTimer: number | undefined;

	createEffect(
		on(
			() => cart.total(),
			(total, previous) => {
				if (previous === undefined || total === previous) return;
				setTotalPulse(false);
				requestAnimationFrame(() => setTotalPulse(true));
				window.clearTimeout(totalPulseTimer);
				totalPulseTimer = window.setTimeout(() => setTotalPulse(false), 350);
			},
		),
	);

	onCleanup(() => {
		if (typeof window !== "undefined") {
			window.clearTimeout(totalPulseTimer);
		}
	});

	return (
		<Sheet open={cart.isDrawerOpen()} onOpenChange={cart.closeDrawer}>
			<SheetContent
				position="right"
				closeLabel="Сагсыг хаах"
				focusRestore={cartSheetFocusRestore}
				class="flex w-full flex-col gap-0 border-border border-l bg-background p-0 shadow-soft-xl ease-(--ease-drawer) data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms] sm:max-w-md"
			>
				<SheetHeader class="space-y-0.5 border-border border-b px-5 pt-5 pb-4 text-left sm:text-left">
					<SheetTitle class="flex items-center gap-2.5 font-display text-foreground text-xl">
						<span class="flex size-9 items-center justify-center rounded-full bg-wash-lemon">
							<IconShoppingCart class="h-5 w-5" aria-hidden="true" />
						</span>
						Таны сагс
					</SheetTitle>
					<p
						class={cn(
							"font-medium text-muted-foreground text-sm",
							totalPulse() && "animate-quantity-pop",
						)}
					>
						{cart.count()} бүтээгдэхүүн
					</p>
				</SheetHeader>

				<div class="flex min-h-0 flex-1 flex-col">
					<Show
						when={!isEmpty()}
						fallback={
							<div class="flex flex-1 items-center justify-center p-6">
								<EmptyCart />
							</div>
						}
					>
						<div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
							<div class="space-y-3 px-4 py-4">
								<For each={cart.items()}>
									{(item) => (
										<CartDrawerItem
											item={item}
											onNavigate={() => cart.closeDrawer()}
										/>
									)}
								</For>
							</div>
							<CartCrossSells />
						</div>

						<div class="border-border border-t bg-card px-5 pt-4 pb-5">
							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Дэд дүн</span>
									<span class="font-medium text-foreground">
										₮{cart.total().toLocaleString()}
									</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Хүргэлт</span>
									<span class="font-medium text-foreground">
										₮{deliveryFee.toLocaleString()}
									</span>
								</div>
								<div class="flex items-baseline justify-between border-border border-t pt-3">
									<span class="font-semibold text-foreground">Нийт дүн</span>
									<span
										class={cn(
											"font-display text-2xl text-foreground",
											totalPulse() && "animate-quantity-pop",
										)}
									>
										₮{(cart.total() + deliveryFee).toLocaleString()}
									</span>
								</div>
							</div>

							<a
								href="/checkout"
								class={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}
								onClick={() => cart.closeDrawer()}
							>
								Худалдан авах <IconArrowRight aria-hidden="true" />
							</a>

							<button
								type="button"
								onClick={() => cart.closeDrawer()}
								class={cn(buttonVariants({ variant: "ghost" }), "mt-2 w-full")}
							>
								Үргэлжлүүлэх
							</button>
						</div>
					</Show>
				</div>
			</SheetContent>
		</Sheet>
	);
};

export default CartDrawer;
