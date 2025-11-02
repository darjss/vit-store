import { For, Show, createSignal, onMount } from "solid-js";
import { Image } from "@unpic/solid";
import { deliveryFee } from "@/lib/constant";
import { cart } from "@/store/cart";
import CartActions from "./cart-actions";

const EmptyCart = () => {
	return (
		<div class="flex flex-col items-center justify-center py-16 md:py-24">
			<div class="max-w-md border-4 border-border bg-card p-8 text-center shadow-[8px_8px_0_0_#000] md:p-12">
				<div class="mb-6 inline-flex h-24 w-24 items-center justify-center border-4 border-border bg-muted">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="48"
						height="48"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="square"
						stroke-linejoin="miter"
					>
						<path d="M9 2L7 6" />
						<path d="M17 2l2 4" />
						<path d="M4 6h16l-1.7 12c-.2 1.4-1.4 2-2.8 2H8.5c-1.4 0-2.6-.6-2.8-2L4 6z" />
						<path d="M9 11v6" />
						<path d="M15 11v6" />
					</svg>
				</div>
				<h2 class="mb-3 font-black text-2xl uppercase md:text-3xl">
					Сагс хоосон байна
				</h2>
				<p class="mb-6 font-bold text-muted-foreground">
					Та одоогоор ямар ч бүтээгдэхүүн нэмээгүй байна
				</p>
				<a href="/products">
					<button
						type="button"
						class="inline-flex h-12 items-center justify-center border-4 border-border bg-primary px-8 py-3 font-black text-base text-primary-foreground uppercase tracking-wider shadow-[6px_6px_0_0_#000] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:bg-primary/90 hover:shadow-[3px_3px_0_0_#000] active:scale-[0.98]"
					>
						Дэлгүүр үзэх
					</button>
				</a>
			</div>
		</div>
	);
};

const LoadingCart = () => {
	return (
		<div class="flex flex-col items-center justify-center py-16 md:py-24">
			<div class="max-w-md border-4 border-border bg-card p-8 text-center shadow-[8px_8px_0_0_#000] md:p-12">
				<div class="mb-6 inline-flex h-24 w-24 items-center justify-center border-4 border-border bg-muted">
					<div class="h-8 w-8 animate-spin border-4 border-border border-t-primary" />
				</div>
				<h2 class="mb-3 font-black text-2xl uppercase md:text-3xl">
					Уншиж байна...
				</h2>
			</div>
		</div>
	);
};

const CartList = () => {
	const [isMounted, setIsMounted] = createSignal(false);
	onMount(() => setIsMounted(true));

	return (
		<Show when={isMounted()} fallback={<LoadingCart />}>
			<Show when={cart.items.length !== 0} fallback={<EmptyCart />}>
				<div class="flex w-full flex-col gap-4">
					<For each={cart.items}>
						{(item) => (
							<div class="hover:-translate-y-1 border-4 border-border bg-card p-4 shadow-[6px_6px_0_0_#000] transition-all hover:shadow-[8px_8px_0_0_#000] md:p-6">
								<div class="hidden md:flex md:items-center md:gap-6">
									<div class="flex w-1/2 items-center gap-5">
										<div class="h-24 w-24 flex-shrink-0 overflow-hidden border-4 border-border bg-secondary/5 shadow-[4px_4px_0_0_#000]">
											<a href={`/product/${item.productId}`}>
												<Image
													src={item.image}
													alt={`${item.name} `}
													width={96}
													height={96}
													layout="fixed"
													class="h-full w-full object-cover object-center transition-transform hover:scale-110"
												/>
											</a>
										</div>
										<div class="flex-1">
											<a href={`/product/${item.productId}`}>
												<h2 class="font-black text-lg uppercase transition-colors hover:text-primary">
													{item.name}
												</h2>
											</a>
											<p class="mt-1 font-bold text-muted-foreground text-sm">
												үнэ: ₮{item.price.toLocaleString()}
											</p>
										</div>
									</div>

									<div class="flex w-1/4 justify-center">
										<CartActions
											quantity={item.quantity}
											productId={item.productId}
										/>
									</div>

									<div class="flex w-1/4 justify-end">
										<div class="font-black text-2xl text-primary">
											₮{(item.price * item.quantity).toLocaleString()}
										</div>
									</div>
								</div>

								<div class="flex flex-col md:hidden">
									<div class="mb-4 flex gap-4">
										<div class="h-24 w-24 flex-shrink-0 overflow-hidden border-4 border-border bg-secondary/5 shadow-[4px_4px_0_0_#000]">
											<a href={`/product/${item.productId}`}>
												<Image
													src={item.image}
													alt={`${item.name}`}
													width={96}
													height={96}
													layout="fixed"
													class="h-full w-full object-cover object-center"
												/>
											</a>
										</div>
										<div class="flex flex-1 flex-col justify-between">
											<a href={`/product/${item.productId}`}>
												<h2 class="font-black text-base uppercase">
													{item.name}
												</h2>
											</a>
											<p class="font-bold text-muted-foreground text-xs">
												₮{item.price.toLocaleString()} / ширхэг
											</p>
										</div>
									</div>

									<div class="flex items-center justify-between border-border border-t-2 pt-4">
										<CartActions
											quantity={item.quantity}
											productId={item.productId}
										/>

										<div class="font-black text-primary text-xl">
											₮{(item.price * item.quantity).toLocaleString()}
										</div>
									</div>
								</div>
							</div>
						)}
					</For>
				</div>
				<div class="mt-8 border-4 border-border bg-card p-6 shadow-[8px_8px_0_0_#000] md:p-8">
					<div class="md:ml-auto md:w-2/3 lg:w-1/2">
						<h2 class="mb-6 border-border border-b-4 pb-3 font-black text-2xl uppercase tracking-tight">
							Захиалгын дүн
						</h2>

						<div class="space-y-4">
							<div class="flex items-center justify-between">
								<p class="font-bold text-base uppercase">Нийт бүтээгдэхүүн</p>
								<div class="border-4 border-border bg-primary px-4 py-2 font-black text-lg">
									{cart.count}
								</div>
							</div>

							<div class="flex items-center justify-between">
								<p class="font-bold text-base uppercase">Дэд дүн</p>
								<p class="font-black text-xl">₮{cart.total.toLocaleString()}</p>
							</div>

							<div class="flex items-center justify-between border-border border-b-2 pb-4">
								<p class="font-bold text-base uppercase">Хүргэлт</p>
								<p class="font-black text-xl">
									₮{deliveryFee.toLocaleString()}
								</p>
							</div>
						</div>

						<div class="mt-6 flex items-center justify-between border-4 border-border bg-primary/10 p-4 shadow-[4px_4px_0_0_#000]">
							<p class="font-black text-xl uppercase">Нийт дүн</p>
							<p class="font-black text-3xl text-primary">
								₮{(cart.total + deliveryFee).toLocaleString()}
							</p>
						</div>
						<a href="/checkout">
							<button
								type="button"
								class="mt-6 inline-flex h-14 w-full items-center justify-center border-4 border-border bg-primary px-8 py-4 font-black text-lg text-primary-foreground uppercase tracking-wider shadow-[8px_8px_0_0_#000] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:bg-primary/90 hover:shadow-[4px_4px_0_0_#000] active:scale-[0.98]"
							>
								Худалдан авах
							</button>
						</a>
					</div>
				</div>
			</Show>
		</Show>
	);
};

export default CartList;
