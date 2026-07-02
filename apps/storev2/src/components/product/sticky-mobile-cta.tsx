import { formatCurrency } from "@vit/shared";
import type { CartItems } from "@vit/shared/types";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { Button } from "@/components/ui/button";
import { cart } from "@/store/cart";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";

interface StickyMobileCtaProps {
	cartItem: CartItems;
}

export default function StickyMobileCta(props: StickyMobileCtaProps) {
	const [visible, setVisible] = createSignal(false);

	onMount(() => {
		const mainCta = document.getElementById("product-main-cta");
		if (!mainCta) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				// Show sticky bar when main CTA is NOT visible
				setVisible(!entry.isIntersecting);
			},
			{ threshold: 0.1, rootMargin: "0px" },
		);

		observer.observe(mainCta);
		onCleanup(() => observer.disconnect());
	});

	const handleAdd = () => {
		cart.add(props.cartItem, { openDrawer: true });
	};

	return (
		<>
			<Show when={visible()}>
				{/* Spacer prevents the floating bar from overlapping footer/content at scroll bottom */}
				<div class="h-20 sm:hidden" aria-hidden="true" />
			</Show>
			<Presence>
				<Show when={visible()}>
					<Motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 24 }}
						transition={{ duration: 0.3, easing: [0.23, 1, 0.32, 1] }}
						class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 rounded-full border border-border bg-card px-4 py-2 shadow-soft-lg sm:hidden"
					>
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0 pl-1">
								<p class="truncate text-xs text-muted-foreground">
									{props.cartItem.name}
								</p>
								<p class="font-display text-base text-foreground">
									{formatCurrency(props.cartItem.price)}
								</p>
							</div>
							<Button
								type="button"
								size="default"
								class="shrink-0"
								onClick={handleAdd}
							>
								<IconShoppingCart class="h-4 w-4" />
								Сагслах
							</Button>
						</div>
					</Motion.div>
				</Show>
			</Presence>
		</>
	);
}
