import { Image } from "@unpic/solid";
import type { CartItems } from "@vit/shared/types";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";
import IconClose from "~icons/ri/close-line";

interface CartDrawerItemProps {
	item: CartItems;
	onNavigate?: () => void;
}

const EXIT_MS = 350;

const CartDrawerItem = (props: CartDrawerItemProps) => {
	const [removing, setRemoving] = createSignal(false);
	const [measuredHeight, setMeasuredHeight] = createSignal<number | null>(null);
	const [quantityPulse, setQuantityPulse] = createSignal(false);
	let rootEl: HTMLDivElement | undefined;
	let quantityPulseTimer: number | undefined;

	createEffect(
		on(
			() => props.item.quantity,
			(quantity, previous) => {
				if (previous === undefined || quantity === previous) return;
				setQuantityPulse(false);
				requestAnimationFrame(() => setQuantityPulse(true));
				window.clearTimeout(quantityPulseTimer);
				quantityPulseTimer = window.setTimeout(
					() => setQuantityPulse(false),
					350,
				);
			},
		),
	);

	onCleanup(() => {
		if (typeof window !== "undefined") {
			window.clearTimeout(quantityPulseTimer);
		}
	});

	const productUrl = () =>
		`/products/${props.item.slug}-${props.item.productId}/`;

	const startRemove = () => {
		if (removing()) return;
		if (rootEl) {
			setMeasuredHeight(rootEl.offsetHeight);
		}
		setRemoving(true);
		window.setTimeout(() => cart.remove(props.item.productId), EXIT_MS);
	};

	const handleIncrement = () => {
		cart.updateQuantity(props.item.productId, 1);
	};

	// Decrement policy is canonical in the store (floor at 1). The explicit
	// × button (startRemove) is the only path that removes an item.
	const handleDecrement = () => {
		cart.updateQuantity(props.item.productId, -1);
	};

	return (
		<Presence>
			<Show when={!removing()}>
				<Motion.div
					ref={(element) => {
						rootEl = element;
					}}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{
						opacity: 0,
						x: 80,
						rotate: 4,
						scale: 0.9,
						...(measuredHeight() !== null
							? { height: [`${measuredHeight()}px`, "0px"] }
							: {}),
						transition: {
							duration: EXIT_MS / 1000,
							easing: [0.16, 1, 0.3, 1],
						},
					}}
					transition={{ duration: 0.25, easing: [0.25, 1, 0.5, 1] }}
					class={cn(
						"rounded-2xl border border-border bg-card p-3 shadow-soft-sm",
						removing() && "overflow-hidden",
					)}
				>
					<div class="flex gap-3">
						<a
							href={productUrl()}
							onClick={props.onNavigate}
							class={cn(
								"block size-20 shrink-0 overflow-hidden rounded-xl",
								washBg(props.item.productId),
							)}
						>
							<Image
								src={props.item.image}
								alt={props.item.name}
								width={80}
								height={80}
								layout="fixed"
								class="h-full w-full object-cover object-center"
							/>
						</a>

						<div class="flex min-w-0 flex-1 flex-col">
							<div class="flex items-start justify-between gap-1">
								<a
									href={productUrl()}
									onClick={props.onNavigate}
									class="line-clamp-2 pt-0.5 font-semibold text-foreground text-sm leading-snug transition-colors duration-[140ms] ease-out hover:text-cocoa"
								>
									{props.item.name}
								</a>
								<button
									type="button"
									onClick={startRemove}
									class="-mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-[140ms] ease-out hover:bg-error hover:text-error-foreground active:scale-95"
									aria-label="Устгах"
								>
									<IconClose class="h-4 w-4" aria-hidden="true" />
								</button>
							</div>
							<p class="text-muted-foreground text-xs">
								₮{props.item.price.toLocaleString()} / ширхэг
							</p>

							<div class="mt-auto flex items-center justify-between pt-2">
								<div class="flex items-center rounded-full border border-border bg-background">
									<button
										type="button"
										onClick={handleDecrement}
										class="flex size-11 items-center justify-center rounded-full font-semibold text-base transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted active:scale-95"
										aria-label="Хасах"
									>
										−
									</button>
									<span
										class={cn(
											"min-w-6 text-center font-semibold text-sm tabular-nums",
											quantityPulse() && "animate-quantity-pop",
										)}
									>
										{props.item.quantity}
									</span>
									<button
										type="button"
										onClick={handleIncrement}
										class="flex size-11 items-center justify-center rounded-full font-semibold text-base transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted active:scale-95"
										aria-label="Нэмэх"
									>
										+
									</button>
								</div>

								<span
									class={cn(
										"font-display text-foreground text-sm",
										quantityPulse() && "animate-quantity-pop",
									)}
								>
									₮{(props.item.price * props.item.quantity).toLocaleString()}
								</span>
							</div>
						</div>
					</div>
				</Motion.div>
			</Show>
		</Presence>
	);
};

export default CartDrawerItem;
