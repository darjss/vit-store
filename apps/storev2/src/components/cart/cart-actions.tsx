import useCart from "@/hooks/use-cart";

const CartActions = ({
	quantity,
	productId,
}: {
	quantity: number;
	productId: number;
}) => {
	const { increaseQuantity, decreaseQuantity } = useCart();
	return (
		<div className="mb-3 flex items-center border-4 border-border bg-background p-2">
			<span className="mr-auto font-[var(--heading-font-weight)] text-sm sm:text-base">
				ТОО
			</span>
			<button
				type="button"
				className="flex h-10 w-10 items-center justify-center border-4 border-border bg-background p-2 transition-colors hover:bg-secondary/50"
				data-product-id={productId}
				data-action="decrease"
				onClick={() => decreaseQuantity(productId)}
				aria-label="Decrease quantity"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<title>Decrease quantity</title>
					<path d="M5 12h14" />
				</svg>
			</button>
			<div className="mx-2 border-accent border-b-4 px-4 font-[var(--heading-font-weight)] text-lg">
				{quantity}
			</div>
			<button
				type="button"
				className="flex h-10 w-10 items-center justify-center border-4 border-border bg-background p-2 transition-colors hover:bg-secondary/50"
				data-product-id={productId}
				data-action="increase"
				onClick={() => increaseQuantity(productId)}
				aria-label="Increase quantity"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<title>Increase quantity</title>
					<path d="M5 12h14" />
					<path d="M12 5v14" />
				</svg>
			</button>
		</div>
	);
};

export default CartActions;
