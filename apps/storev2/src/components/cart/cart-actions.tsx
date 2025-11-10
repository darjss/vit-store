import { cart } from "@/store/cart";

const CartActions = ({
	quantity,
	productId,
}: {
	quantity: () => number;
	productId: number;
}) => {
	return (
		<div class="flex items-center gap-3">
			<div class="inline-flex items-center border-4 border-border bg-background shadow-[4px_4px_0_0_#000]">
				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center bg-background transition-all hover:bg-primary/20 active:bg-primary/30"
					data-product-id={productId}
					data-action="decrease"
					onClick={() => cart.updateQuantity(productId, -1)}
					aria-label="Decrease quantity"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="square"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<title>Decrease quantity</title>
						<path d="M5 12h14" />
					</svg>
				</button>
				<div class="flex h-10 min-w-[2.5rem] items-center justify-center border-border border-x-4 bg-background px-3 font-bold text-base">
					{quantity()}
				</div>
				<button
					type="button"
					class="flex h-10 w-10 items-center justify-center bg-background transition-all hover:bg-primary/20 active:bg-primary/30"
					data-product-id={productId}
					data-action="increase"
					onClick={() => cart.updateQuantity(productId, 1)}
					aria-label="Increase quantity"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="square"
						stroke-linejoin="miter"
						aria-hidden="true"
					>
						<title>Increase quantity</title>
						<path d="M5 12h14" />
						<path d="M12 5v14" />
					</svg>
				</button>
			</div>
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center border-4 border-border bg-destructive shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-destructive/90 hover:shadow-[2px_2px_0_0_#000] active:scale-95"
				onClick={() => cart.remove(productId)}
				aria-label="Remove item"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="3"
					stroke-linecap="square"
					stroke-linejoin="miter"
					aria-hidden="true"
				>
					<title>Remove item</title>
					<path d="M18 6L6 18" />
					<path d="M6 6l12 12" />
				</svg>
			</button>
		</div>
	);
};

export default CartActions;
