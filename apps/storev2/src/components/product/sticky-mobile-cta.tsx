import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { cart } from "@/store/cart";
import { formatCurrency } from "@vit/shared";
import IconShoppingCart from "~icons/ri/shopping-cart-2-fill";
import type { CartItems } from "@vit/shared/types";

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
		<Show when={visible()}>
			{/* Spacer prevents the fixed bar from overlapping footer/content at scroll bottom */}
			<div class="h-[70px] sm:hidden" aria-hidden="true" />
			<div class="fixed bottom-0 left-0 right-0 z-50 border-t-4 border-border bg-background px-3 py-2.5 shadow-[0_-4px_0_rgba(0,0,0,0.15)] sm:hidden">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0">
						<p class="truncate font-black text-sm text-foreground">
							{props.cartItem.name}
						</p>
						<p class="font-black text-base text-foreground">
							{formatCurrency(props.cartItem.price)}
						</p>
					</div>
					<button
						type="button"
						onClick={handleAdd}
						class="flex shrink-0 items-center gap-2 border-3 border-border bg-primary px-5 py-2.5 font-black text-sm uppercase tracking-tight shadow-hard transition-all active:scale-[0.98]"
					>
						<IconShoppingCart class="h-4 w-4" />
						Сагслах
					</button>
				</div>
			</div>
		</Show>
	);
}
