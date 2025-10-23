import { deliveryFee } from "@/lib/constant";
import useCart from "../../hooks/use-cart";
import CartActions from "./cart-actions";

const CartList = () => {
	const { cart, cartTotal, cartCount } = useCart();
	return (
		<>
			<div className="flex w-full flex-col">
				<div className="mb-10">
					{cart.value.map((item, index) => {
						return (
							<div
								key={item.productId}
								className={`py-6 ${index !== cart.value.length - 1 ? "border-border border-b" : ""}`}
							>
								<div className="hidden md:flex md:items-center">
									<div className="flex w-2/5 items-center">
										<div className="h-20 w-20 flex-shrink-0 overflow-hidden border border-border">
											<a href={`/product/${item.productId}`}>
												<img
													src={item.image}
													alt={`${item.name} `}
													className="h-full w-full object-cover object-center"
												/>
											</a>
										</div>
										<div className="ml-5">
											<a href={`/product/${item.productId}`}>
												<h2 className="font-bold text-xl">{item.name}</h2>
											</a>
										</div>
									</div>

									<div className="flex w-1/5 justify-center">
										<div className="flex-shrink-0">
											<CartActions
												quantity={item.quantity}
												productId={item.productId}
											/>
										</div>
									</div>

									<div className="flex w-1/5 justify-center font-bold text-foreground text-xl">
										₮{item.price.toLocaleString()}
									</div>

									<div className="flex w-1/5 justify-end">
										<div className="font-bold text-primary">
											<p className="text-right text-xl">
												₮{(item.price * item.quantity).toLocaleString()}
											</p>
										</div>
									</div>
								</div>

								<div className="flex flex-col md:hidden">
									<div className="mb-4 flex">
										<div className="h-16 w-16 flex-shrink-0 overflow-hidden border border-border">
											<img
												src={item.image}
												alt={`${item.name}`}
												className="h-full w-full object-cover object-center"
											/>
										</div>
										<div className="ml-3 flex-1">
											<h2 className="font-bold text-base">{item.name}</h2>
											<p className="mt-1 font-bold text-md">
												₮{item.price.toLocaleString()}
											</p>
										</div>
									</div>

									<div className="flex items-center justify-between">
										<div className="flex-shrink-0">
											<CartActions
												quantity={item.quantity}
												productId={item.productId}
											/>
										</div>

										<div className="font-bold text-primary">
											<p className="text-right text-base">
												₮{(item.price * item.quantity).toLocaleString()}
											</p>
										</div>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
			<div className="mt-10 border-border border-t pt-6">
				<div className="md:ml-auto md:w-1/2">
					<h2 className="mb-6 font-bold text-2xl uppercase tracking-tight">
						Захиалгын дүн
					</h2>

					<div className="flex justify-between border-border border-b py-3">
						<p className="font-bold text-lg">Нийт бүтээгдэхүүн</p>
						<p className="font-bold text-xl">{cartCount.value}</p>
					</div>

					<div className="flex justify-between border-border border-b py-3">
						<p className="font-bold text-lg">Дэд дүн</p>
						<p className="font-bold text-xl">
							₮{cartTotal.value.toLocaleString()}
						</p>
					</div>

					<div className="flex justify-between py-3">
						<p className="font-bold text-lg">Хүргэлт</p>
						<p className="font-bold text-xl">₮{deliveryFee.toLocaleString()}</p>
					</div>

					<div className="mt-3 flex justify-between border-border border-t py-4">
						<p className="font-bold text-xl">Нийт дүн</p>
						<p className="font-bold text-2xl text-primary">
							₮{(cartTotal.value + deliveryFee).toLocaleString()}
						</p>
					</div>
					<a href="/checkout">
						<button
							type="button"
							className="mt-6 inline-flex h-14 w-full items-center justify-center border border-border bg-primary px-6 py-3 font-bold text-lg text-primary-foreground uppercase tracking-wider transition-all hover:bg-primary/90"
						>
							Худалдан авах
						</button>
					</a>
				</div>
			</div>
		</>
	);
};

export default CartList;
