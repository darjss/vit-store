import { onMount } from "solid-js";
import { trackPixel } from "@/lib/meta-pixel";

// Fires Purchase once per paid payment on this device. The success page only
// renders for payments the server marked paid, so a reload must not count twice.
const MetaPurchase = (props: {
	paymentNumber: string;
	products: Array<{ productId: number; quantity: number }>;
	total: number;
}) => {
	onMount(() => {
		const key = `meta-purchase:${props.paymentNumber}`;
		try {
			if (localStorage.getItem(key)) {
				return;
			}
			localStorage.setItem(key, "1");
		} catch {
			// localStorage unavailable: fire anyway, eventID still dedupes on Meta's side.
		}
		trackPixel(
			"Purchase",
			{
				content_ids: props.products.map((product) => String(product.productId)),
				content_type: "product",
				contents: props.products.map((product) => ({
					id: String(product.productId),
					quantity: product.quantity,
				})),
				currency: "MNT",
				num_items: props.products.reduce((sum, product) => sum + product.quantity, 0),
				value: props.total,
			},
			{ eventID: props.paymentNumber },
		);
	});

	return null;
};

export default MetaPurchase;
