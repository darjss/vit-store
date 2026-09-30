import { createEffect, createSignal, on, onMount, Show } from "solid-js";
import { cart } from "@/store/cart";
import { cn } from "@/lib/utils";

const CartCount = () => {
	const [isHydrated, setIsHydrated] = createSignal(false);
	const [pulse, setPulse] = createSignal(false);
	let pulseTimer: number | undefined;

	onMount(() => {
		setIsHydrated(true);
	});

	createEffect(
		on(
			() => cart.count(),
			(count, prev) => {
				if (prev === undefined || count === prev || count === 0) {
					return;
				}
				setPulse(false);
				requestAnimationFrame(() => setPulse(true));
				window.clearTimeout(pulseTimer);
				pulseTimer = window.setTimeout(() => setPulse(false), 400);
			},
		),
	);

	return (
		<Show when={isHydrated() && cart.count() > 0}>
			<span
				class={cn(
					"border-background bg-secondary text-secondary-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] font-bold",
					pulse() && "animate-count-pop",
				)}
			>
				{cart.count()}
			</span>
		</Show>
	);
};
export default CartCount;
