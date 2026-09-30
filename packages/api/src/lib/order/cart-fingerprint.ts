export function cartFingerprint(items: Array<{ productId: number; quantity: number }>) {
	return items
		.map((item) => ({
			productId: Math.trunc(item.productId),
			quantity: Math.trunc(item.quantity),
		}))
		.filter((item) => item.productId > 0 && item.quantity > 0)
		.sort((a, b) => a.productId - b.productId)
		.map((item) => `${item.productId}:${item.quantity}`)
		.join("|");
}
