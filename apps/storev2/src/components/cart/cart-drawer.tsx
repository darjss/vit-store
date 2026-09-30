import { ArrowRightIcon as IconArrowRight } from "@solar-icons/solid/linear";
import { CartLarge2Icon as IconShoppingCart } from "@solar-icons/solid/linear/cart-large-2";
import { deliveryFee } from "@vit/shared/constants";
import { createEffect, createSignal, For, on, onCleanup, Show } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { isServer } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { cart } from "@/store/cart";
import CartCrossSells from "./cart-cross-sells";
import CartDrawerItem from "./cart-drawer-item";
import { cartSheetFocusRestore } from "./cart-sheet-focus";
import EmptyCart from "./empty-cart";

const isEmpty = () => cart.items().length === 0;

const CartDrawer = () => {
	const [totalPulse, setTotalPulse] = createSignal(false);
	let totalPulseTimer: number | undefined;

	createEffect(
		on(
			() => cart.total(),
			(total, previous) => {
				if (previous === undefined || total === previous) {
					return;
				}
				setTotalPulse(false);
				requestAnimationFrame(() => setTotalPulse(true));
				window.clearTimeout(totalPulseTimer);
				totalPulseTimer = window.setTimeout(() => setTotalPulse(false), 350);
			},
		),
	);

	onCleanup(() => {
		if (!isServer) {
			window.clearTimeout(totalPulseTimer);
		}
	});

	return (
		<Sheet onOpenChange={cart.closeDrawer} open={cart.isDrawerOpen()}>
			<SheetContent
				class="border-border bg-background shadow-soft-xl flex w-full flex-col gap-0 border-l p-0 ease-(--ease-drawer) data-[closed=]:duration-[260ms] data-[expanded=]:duration-[520ms] sm:max-w-md"
				closeLabel="Сагсыг хаах"
				focusRestore={cartSheetFocusRestore}
				position="right"
			>
				<SheetHeader class="border-border space-y-0.5 border-b px-5 pt-5 pb-4 text-left sm:text-left">
					<SheetTitle class="font-display text-foreground flex items-center gap-2.5 text-xl">
						<span class="bg-wash-lemon flex size-9 items-center justify-center rounded-full">
							<IconShoppingCart aria-hidden="true" class="h-5 w-5" strokeWidth={2} />
						</span>
						Таны сагс
					</SheetTitle>
					<p
						class={cn(
							"text-muted-foreground text-sm font-medium",
							totalPulse() && "animate-quantity-pop",
						)}
					>
						{cart.count()} бүтээгдэхүүн
					</p>
				</SheetHeader>

				<div class="flex min-h-0 flex-1 flex-col">
					<Show
						fallback={
							<div class="flex flex-1 items-center justify-center p-6">
								<EmptyCart />
							</div>
						}
						when={!isEmpty()}
					>
						<div class="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
							<div class="space-y-3 px-4 py-4">
								<For each={cart.items()}>
									{(item) => <CartDrawerItem item={item} onNavigate={() => cart.closeDrawer()} />}
								</For>
							</div>
							<CartCrossSells />
						</div>

						<div class="border-border bg-card border-t px-5 pt-4 pb-5">
							<div class="space-y-2">
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Дэд дүн</span>
									<span class="text-foreground font-medium">₮{cart.total().toLocaleString()}</span>
								</div>
								<div class="flex items-center justify-between text-sm">
									<span class="text-muted-foreground">Хүргэлт</span>
									<span class="text-foreground font-medium">₮{deliveryFee.toLocaleString()}</span>
								</div>
								<div class="border-border flex items-baseline justify-between border-t pt-3">
									<span class="text-foreground font-semibold">Нийт дүн</span>
									<span
										class={cn(
											"font-display text-foreground rounded-lg px-1 text-2xl",
											totalPulse() && "animate-cart-total-flash",
										)}
									>
										₮{(cart.total() + deliveryFee).toLocaleString()}
									</span>
								</div>
							</div>

							<a
								class={cn(buttonVariants({ size: "lg" }), "mt-4 w-full")}
								href="/checkout"
								onClick={() => cart.closeDrawer()}
							>
								Худалдан авах <IconArrowRight aria-hidden="true" />
							</a>

							<button
								class={cn(buttonVariants({ variant: "ghost" }), "mt-2 w-full")}
								onClick={() => cart.closeDrawer()}
								type="button"
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
