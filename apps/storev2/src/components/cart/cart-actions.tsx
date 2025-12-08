import { cart } from "@/store/cart";
import IconMinus from "~icons/ri/subtract-line";
import IconPlus from "~icons/ri/add-line";
import IconClose from "~icons/ri/close-line";

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
					<IconMinus class="h-4 w-4" aria-hidden="true" />
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
					<IconPlus class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
			<button
				type="button"
				class="flex h-10 w-10 items-center justify-center border-4 border-border bg-destructive shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-destructive/90 hover:shadow-[2px_2px_0_0_#000] active:scale-95"
				onClick={() => cart.remove(productId)}
				aria-label="Remove item"
			>
				<IconClose class="h-4 w-4 text-white" aria-hidden="true" />
			</button>
		</div>
	);
};

export default CartActions;
