import { For, Show } from "solid-js";
import { cart } from "@/store/cart";
import { deliveryFee } from "@/lib/constant";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import CartDrawerItem from "./cart-drawer-item";
import EmptyCart from "./empty-cart";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import IconArrowRight from "~icons/ri/arrow-right-line";

const CartDrawer = () => {
	const isEmpty = () => cart.items().length === 0;

	return (
		<Sheet open={cart.isDrawerOpen()} onOpenChange={cart.closeDrawer}>
			<SheetContent
				position="right"
				class="flex w-full flex-col border-4 border-l-border bg-background p-0 shadow-hard-xl sm:max-w-md"
			>
				{/* Header */}
				<SheetHeader class="border-border border-b-4 bg-primary p-4">
					<SheetTitle class="flex items-center gap-2 font-black text-2xl uppercase tracking-tighter">
						<IconShoppingCart class="h-6 w-6" /> Таны сагс
					</SheetTitle>
					<p class="font-bold text-foreground text-sm">
						{cart.count()} бүтээгдэхүүн
					</p>
				</SheetHeader>

				<div class="flex flex-1 flex-col overflow-hidden">
					<Show
						when={!isEmpty()}
						fallback={
							<div class="flex flex-1 items-center justify-center p-6">
								<EmptyCart />
							</div>
						}
					>
						{/* Cart Items - Scrollable */}
						<div class="scrollbar-hide flex-[2] space-y-3 overflow-y-auto p-4">
							<For each={cart.items()}>
								{(item) => <CartDrawerItem item={item} />}
							</For>
						</div>

						{/* Footer - Summary & Checkout */}
						<div class="border-border border-t-4 bg-card p-3">
							{/* Summary */}
							<div class="space-y-3">
								{/* Subtotal */}
								<div class="flex items-center justify-between">
									<span class="font-bold uppercase">Дэд дүн</span>
									<span class="font-black text-lg">
										₮{cart.total().toLocaleString()}
									</span>
								</div>

								{/* Delivery */}
								<div class="flex items-center justify-between border-border border-b-2 pb-3">
									<span class="font-bold uppercase">Хүргэлт</span>
									<span class="font-black text-lg">
										₮{deliveryFee.toLocaleString()}
									</span>
								</div>

								{/* Total */}
								<div class="flex items-center justify-between border-4 border-border bg-primary/10 p-3 shadow-hard">
									<span class="font-black text-xl uppercase">Нийт дүн</span>
									<span class="font-black text-2xl text-primary">
										₮{(cart.total() + deliveryFee).toLocaleString()}
									</span>
								</div>
							</div>

							{/* Checkout Button */}
							<a
								href="/checkout"
								class="mt-4 block"
								onClick={() => cart.closeDrawer()}
							>
								<button
									type="button"
									class="flex w-full items-center justify-center gap-2 border-4 border-border bg-primary px-6 py-4 font-black text-lg uppercase tracking-wider shadow-hard-lg transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary/90 hover:shadow-hard active:scale-[0.98]"
								>
									Худалдан авах <IconArrowRight class="h-5 w-5" />
								</button>
							</a>

							{/* Continue Shopping */}
							<button
								type="button"
								onClick={() => cart.closeDrawer()}
								class="mt-3 w-full border-2 border-border bg-background px-6 py-3 font-bold uppercase tracking-wider shadow-hard transition-all hover:translate-x-px hover:translate-y-px hover:bg-muted hover:shadow-none active:scale-[0.98]"
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
