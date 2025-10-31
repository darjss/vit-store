import { formatCurrency } from "@vit/shared/utils";
import { Button } from "@/components/ui/button";
import { cart } from "@/store/cart";
import type { CartItems } from "@/lib/types";
import { Show } from "solid-js";
import AddToCartButton from "../cart/add-to-cart-button";

interface ProductInfoProps {
	product: {
		id: number;
		name: string;
		price: number;
		discount?: number | null;
		brand: { name: string };
		category: { name: string };
		status: string;
		amount?: string | null;
		potency?: string | null;
	};
	primaryImage: string;
}

export default function ProductInfo(props: ProductInfoProps) {
	const discountedPrice = () => {
		if (!props.product.discount) return props.product.price;
		return props.product.price * (1 - props.product.discount / 100);
	};

	const handleAddToCart = () => {
		const cartItem: CartItems = {
			productId: props.product.id,
			quantity: 1,
			name: props.product.name,
			price: props.product.price,
			image: props.primaryImage,
		};
		cart.add(cartItem);
	};

	return (
		<div class="space-y-6 sm:space-y-8">
			{/* Brand Badge */}
			<div class="inline-flex items-center gap-2 rounded-sm border-3 border-black bg-white px-4 py-2 font-black text-xs sm:text-sm uppercase shadow-[3px_3px_0_0_#000]">
				<span>🏷️</span>
				<span>{props.product.brand.name}</span>
			</div>

			{/* Product Title */}
			<h1 class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight">
				{props.product.name}
			</h1>

			{/* Category & Amount Info */}
			<div class="flex flex-wrap gap-2 sm:gap-3">
				<div class="rounded-sm border-2 border-black bg-muted px-3 py-1.5 text-xs sm:text-sm font-bold">
					📦 {props.product.category.name}
				</div>
				<Show when={props.product.amount}>
					<div class="rounded-sm border-2 border-black bg-muted px-3 py-1.5 text-xs sm:text-sm font-bold">
						⚖️ {props.product.amount}
					</div>
				</Show>
				<Show when={props.product.potency}>
					<div class="rounded-sm border-2 border-black bg-muted px-3 py-1.5 text-xs sm:text-sm font-bold">
						💪 {props.product.potency}
					</div>
				</Show>
			</div>

			{/* Price Section */}
			<div class="rounded-sm border-4 border-black bg-primary/40 p-6 sm:p-8 shadow-[6px_6px_0_0_#000] sm:shadow-[8px_8px_0_0_#000]">
				<div class="flex flex-col gap-3">
					<div class="flex items-end gap-3 sm:gap-4">
						<Show when={props.product.discount}>
							<div class="text-xl sm:text-2xl font-bold text-black/40 line-through">
								€{formatCurrency(props.product.price)}
							</div>
						</Show>
						<div class="text-4xl sm:text-5xl md:text-6xl font-black">
							€{formatCurrency(discountedPrice())}
						</div>
					</div>

					<Show when={props.product.discount}>
						<div class="inline-flex w-fit items-center gap-2 rounded-sm border-3 border-black bg-destructive px-4 py-2 font-black text-sm sm:text-base uppercase text-white shadow-[3px_3px_0_0_#000]">
							🔥 Save {props.product.discount}%
						</div>
					</Show>
				</div>
			</div>

			<AddToCartButton cartItem={{
				productId: props.product.id,
				quantity: 1,
				name: props.product.name,
				price: props.product.price,
				image: props.primaryImage,
			}}>
			</AddToCartButton>
			{/* Status Badge */}
			<Show when={props.product.status === "active"}>
				<div class="flex items-center gap-2 text-sm sm:text-base font-bold text-green-600">
					<span class="inline-block size-3 sm:size-4 rounded-full border-2 border-black bg-green-500 shadow-[2px_2px_0_0_#000]" />
					<span>In Stock & Ready to Ship</span>
				</div>
			</Show>
		</div>
	);
}
