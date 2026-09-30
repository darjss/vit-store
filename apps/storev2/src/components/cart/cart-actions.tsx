import { cart } from "@/store/cart";
import {
	AddCircleIcon as IconPlus,
	CloseCircleIcon as IconClose,
	MinusCircleIcon as IconMinus,
} from "@solar-icons/solid/linear";

const CartActions = ({ productId, quantity }: { productId: number; quantity: () => number }) => {
	return (
		<div class="flex items-center gap-2">
			<div class="border-border bg-background shadow-soft-sm inline-flex items-center rounded-full border">
				<button
					aria-label="Хасах"
					class="hover:bg-muted flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-[140ms] ease-out active:scale-95"
					data-action="decrease"
					data-product-id={productId}
					onClick={() => cart.updateQuantity(productId, -1)}
					type="button"
				>
					<IconMinus aria-hidden="true" class="h-4 w-4" />
				</button>
				<div class="text-foreground flex min-w-7 items-center justify-center text-sm font-semibold tabular-nums">
					{quantity()}
				</div>
				<button
					aria-label="Нэмэх"
					class="hover:bg-muted flex size-11 items-center justify-center rounded-full transition-[background-color,transform] duration-[140ms] ease-out active:scale-95"
					data-action="increase"
					data-product-id={productId}
					onClick={() => cart.updateQuantity(productId, 1)}
					type="button"
				>
					<IconPlus aria-hidden="true" class="h-4 w-4" />
				</button>
			</div>
			<button
				aria-label="Устгах"
				class="text-muted-foreground hover:bg-error hover:text-error-foreground flex size-11 items-center justify-center rounded-full transition-[background-color,color,transform] duration-[140ms] ease-out active:scale-95"
				onClick={() => cart.remove(productId)}
				type="button"
			>
				<IconClose aria-hidden="true" class="h-4 w-4" />
			</button>
		</div>
	);
};

export default CartActions;
