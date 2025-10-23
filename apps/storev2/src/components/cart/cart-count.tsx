import useCart from "@/hooks/use-cart";

const CartCount = () => {
	const { cartCount } = useCart();
	return <p class="font-bold text-xs">{cartCount.value}</p>;
};
export default CartCount;
