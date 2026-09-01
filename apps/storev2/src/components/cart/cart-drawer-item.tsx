import { Image } from "@unpic/solid";
import type { CartItems } from "@vit/shared/types";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";
import { Motion, Presence } from "solid-motionone";
import { isServer } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";
import { CloseCircleIcon as IconClose } from "@solar-icons/solid/linear";

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
				if (previous === undefined || quantity === previous) {
					return;
				}
				setQuantityPulse(false);
				requestAnimationFrame(() => setQuantityPulse(true));
				window.clearTimeout(quantityPulseTimer);
				quantityPulseTimer = window.setTimeout(() => setQuantityPulse(false), 350);
			},
		),
	);

	onCleanup(() => {
		if (!isServer) {
			window.clearTimeout(quantityPulseTimer);
		}
	});

	const productUrl = () => `/products/${props.item.slug}-${props.item.productId}/`;

	const startRemove = () => {
		if (removing()) {
			return;
		}
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

	const measured = measuredHeight();

	return (
		<Presence>
			<Show when={!removing()}>
				<Motion.div
					animate={{ opacity: 1, y: 0 }}
					class={cn(
						"border-border bg-card shadow-soft-sm rounded-2xl border p-3",
						removing() && "overflow-hidden",
					)}
					exit={
						measured !== null
							? {
									height: [`${measured}px`, "0px"],
									opacity: 0,
									rotate: 4,
									scale: 0.9,
									transition: {
										duration: EXIT_MS / 1000,
										easing: [0.16, 1, 0.3, 1],
									},
									x: 80,
								}
							: {
									opacity: 0,
									rotate: 4,
									scale: 0.9,
									transition: {
										duration: EXIT_MS / 1000,
										easing: [0.16, 1, 0.3, 1],
									},
									x: 80,
								}
					}
					initial={{ opacity: 0, y: 8 }}
					ref={(element) => {
						rootEl = element;
					}}
					transition={{ duration: 0.25, easing: [0.25, 1, 0.5, 1] }}
				>
					<div class="flex gap-3">
						<a
							class={cn(
								"block size-20 shrink-0 overflow-hidden rounded-xl",
								washBg(props.item.productId),
							)}
							href={productUrl()}
							onClick={props.onNavigate}
						>
							<Image
								alt={props.item.name}
								class="h-full w-full object-cover object-center"
								height={80}
								layout="fixed"
								src={props.item.image}
								width={80}
							/>
						</a>

						<div class="flex min-w-0 flex-1 flex-col">
							<div class="flex items-start justify-between gap-1">
								<a
									class="text-foreground hover:text-cocoa line-clamp-2 pt-0.5 text-sm leading-snug font-semibold transition-colors duration-[140ms] ease-out"
									href={productUrl()}
									onClick={props.onNavigate}
								>
									{props.item.name}
								</a>
								<button
									aria-label="Устгах"
									class="text-muted-foreground hover:bg-error hover:text-error-foreground -mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-[140ms] ease-out active:scale-95"
									onClick={startRemove}
									type="button"
								>
									<IconClose aria-hidden="true" class="h-4 w-4" />
								</button>
							</div>
							<p class="text-muted-foreground text-xs">
								₮{props.item.price.toLocaleString()} / ширхэг
							</p>

							<div class="mt-auto flex items-center justify-between pt-2">
								<div class="border-border bg-background flex items-center rounded-full border">
									<button
										aria-label="Хасах"
										class="hover:bg-muted flex size-11 items-center justify-center rounded-full text-base font-semibold transition-[background-color,transform] duration-[140ms] ease-out active:scale-95"
										onClick={handleDecrement}
										type="button"
									>
										−
									</button>
									<span
										class={cn(
											"min-w-6 text-center text-sm font-semibold tabular-nums",
											quantityPulse() && "animate-quantity-pop",
										)}
									>
										{props.item.quantity}
									</span>
									<button
										aria-label="Нэмэх"
										class="hover:bg-muted flex size-11 items-center justify-center rounded-full text-base font-semibold transition-[background-color,transform] duration-[140ms] ease-out active:scale-95"
										onClick={handleIncrement}
										type="button"
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
