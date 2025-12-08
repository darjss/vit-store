import { Image } from "@unpic/solid";
import type { CartItems } from "@/lib/types";
import { cart } from "@/store/cart";

interface CartDrawerItemProps {
	item: CartItems;
}

const CartDrawerItem = (props: CartDrawerItemProps) => {
	const handleRemove = () => {
		cart.remove(props.item.productId);
	};

	const handleIncrement = () => {
		cart.updateQuantity(props.item.productId, 1);
	};

	const handleDecrement = () => {
		if (props.item.quantity > 1) {
			cart.updateQuantity(props.item.productId, -1);
		} else {
			cart.remove(props.item.productId);
		}
	};

	return (
		<div class="hover:-translate-y-1 border-4 border-border bg-card p-3 shadow-hard transition-all hover:shadow-hard-lg">
			<div class="flex gap-3">
				{/* Product Image */}
				<div class="h-20 w-20 flex-shrink-0 overflow-hidden border-3 border-border bg-secondary/5 shadow-hard-sm">
					<a href={`/product/${props.item.productId}`}>
						<Image
							src={props.item.image}
							alt={props.item.name}
							width={80}
							height={80}
							layout="fixed"
							class="h-full w-full object-cover object-center transition-transform hover:scale-110"
						/>
					</a>
				</div>

				{/* Product Info */}
				<div class="flex flex-1 flex-col justify-between">
					<div>
						<a
							href={`/product/${props.item.productId}`}
							class="line-clamp-2 font-black text-sm uppercase transition-colors hover:text-primary"
						>
							{props.item.name}
						</a>
						<p class="mt-1 font-bold text-muted-foreground text-xs">
							₮{props.item.price.toLocaleString()}
						</p>
					</div>

					{/* Quantity Controls & Remove */}
					<div class="mt-2 flex items-center justify-between">
						{/* Quantity Controls */}
						<div class="flex items-center gap-1">
							<button
								type="button"
								onClick={handleDecrement}
								class="flex h-7 w-7 items-center justify-center border-2 border-border bg-background font-black shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:bg-primary hover:shadow-none active:scale-95"
								aria-label="Хасах"
							>
								−
							</button>
							<div class="flex h-7 min-w-[2rem] items-center justify-center border-2 border-border bg-primary px-2 font-black text-sm">
								{props.item.quantity}
							</div>
							<button
								type="button"
								onClick={handleIncrement}
								class="flex h-7 w-7 items-center justify-center border-2 border-border bg-background font-black shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:bg-primary hover:shadow-none active:scale-95"
								aria-label="Нэмэх"
							>
								+
							</button>
						</div>

						{/* Remove Button */}
						<button
							type="button"
							onClick={handleRemove}
							class="flex h-7 w-7 items-center justify-center border-2 border-border bg-error text-error-foreground shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none active:scale-95"
							aria-label="Устгах"
						>
							<svg
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M6 18L18 6M6 6l12 12"
								/>
							</svg>
						</button>
					</div>

					{/* Item Total */}
					<div class="mt-2 border-border border-t-2 pt-2 font-black text-primary text-sm">
						₮{(props.item.price * props.item.quantity).toLocaleString()}
					</div>
				</div>
			</div>
		</div>
	);
};

export default CartDrawerItem;
