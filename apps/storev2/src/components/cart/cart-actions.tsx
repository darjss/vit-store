import { cart } from "@/store/cart";
import IconPlus from "~icons/ri/add-line";
import IconClose from "~icons/ri/close-line";
import IconMinus from "~icons/ri/subtract-line";

const CartActions = ({
	quantity,
	productId,
}: {
	quantity: () => number;
	productId: number;
}) => {
	return (
		<div class="flex items-center gap-2">
			<div class="inline-flex items-center rounded-full border border-border bg-background shadow-soft-sm">
				<button
					type="button"
					class="flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted active:scale-95"
					data-product-id={productId}
					data-action="decrease"
					onClick={() => cart.updateQuantity(productId, -1)}
					aria-label="Хасах"
				>
					<IconMinus class="h-4 w-4" aria-hidden="true" />
				</button>
				<div class="flex min-w-7 items-center justify-center font-semibold text-foreground text-sm tabular-nums">
					{quantity()}
				</div>
				<button
					type="button"
					class="flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-[140ms] ease-out hover:bg-muted active:scale-95"
					data-product-id={productId}
					data-action="increase"
					onClick={() => cart.updateQuantity(productId, 1)}
					aria-label="Нэмэх"
				>
					<IconPlus class="h-4 w-4" aria-hidden="true" />
				</button>
			</div>
			<button
				type="button"
				class="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-[140ms] ease-out hover:bg-error hover:text-error-foreground active:scale-95"
				onClick={() => cart.remove(productId)}
				aria-label="Устгах"
			>
				<IconClose class="h-4 w-4" aria-hidden="true" />
			</button>
		</div>
	);
};

export default CartActions;
