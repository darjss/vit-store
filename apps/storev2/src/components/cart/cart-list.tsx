import { Image } from "@unpic/solid";
import { deliveryFee } from "@vit/shared/constants";
import { For, Match, Switch } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import { cart, createCartState } from "@/store/cart";
import Loading from "../loading";
import CartActions from "./cart-actions";
import EmptyCart from "./empty-cart";

const CartList = () => {
	const cartState = createCartState();

	return (
		<Switch>
			<Match when={cartState() === "loading"}>
				<Loading />
			</Match>
			<Match when={cartState() === "empty"}>
				<EmptyCart />
			</Match>
			<Match when={cartState() === "ready"}>
				<h1 class="enter-fade font-display text-foreground mb-5 text-xl md:text-2xl">Таны сагс</h1>
				<div class="flex w-full flex-col gap-3">
					<For each={cart.items()}>
						{(item, index) => (
							<div
								class={cn(
									"enter-rise border-border bg-card shadow-soft rounded-2xl border p-4 md:p-5",
									index() < 8 && `stagger-${index() + 1}`,
								)}
							>
								<div class="hidden md:flex md:items-center md:gap-6">
									<div class="flex w-1/2 items-center gap-5">
										<a
											class={cn(
												"block size-24 flex-shrink-0 overflow-hidden rounded-xl",
												washBg(item.productId),
											)}
											href={`/products/${item.slug}-${item.productId}/`}
										>
											<Image
												alt={`${item.name} `}
												class="h-full w-full object-cover object-center"
												height={96}
												layout="fixed"
												src={item.image}
												width={96}
											/>
										</a>
										<div class="flex-1">
											<a href={`/products/${item.slug}-${item.productId}/`}>
												<h2 class="text-foreground hover:text-cocoa text-lg font-semibold transition-colors duration-[140ms] ease-out">
													{item.name}
												</h2>
											</a>
											<p class="text-muted-foreground mt-1 text-sm">
												₮{item.price.toLocaleString()} / ширхэг
											</p>
										</div>
									</div>

									<div class="flex w-1/4 justify-center">
										<CartActions productId={item.productId} quantity={() => item.quantity} />
									</div>

									<div class="flex w-1/4 justify-end">
										<div class="font-display text-foreground text-xl">
											₮{(item.price * item.quantity).toLocaleString()}
										</div>
									</div>
								</div>

								<div class="flex flex-col md:hidden">
									<div class="mb-4 flex gap-4">
										<a
											class={cn(
												"block size-24 flex-shrink-0 overflow-hidden rounded-xl",
												washBg(item.productId),
											)}
											href={`/products/${item.slug}-${item.productId}/`}
										>
											<Image
												alt={`${item.name}`}
												class="h-full w-full object-cover object-center"
												height={96}
												layout="fixed"
												src={item.image}
												width={96}
											/>
										</a>
										<div class="flex flex-1 flex-col justify-between">
											<a href={`/products/${item.slug}-${item.productId}/`}>
												<h2 class="text-foreground text-base leading-snug font-semibold">
													{item.name}
												</h2>
											</a>
											<p class="text-muted-foreground text-xs">
												₮{item.price.toLocaleString()} / ширхэг
											</p>
										</div>
									</div>

									<div class="border-border flex items-center justify-between border-t pt-3">
										<CartActions productId={item.productId} quantity={() => item.quantity} />

										<div class="font-display text-foreground text-lg">
											₮{(item.price * item.quantity).toLocaleString()}
										</div>
									</div>
								</div>
							</div>
						)}
					</For>
				</div>
				<div class="enter-rise stagger-3 border-border bg-card shadow-soft mt-6 rounded-2xl border p-5 md:p-8">
					<div class="md:ml-auto md:w-2/3 lg:w-1/2">
						<h2 class="border-border font-display text-foreground mb-5 border-b pb-3 text-lg">
							Захиалгын дүн
						</h2>

						<div class="space-y-3">
							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Нийт бүтээгдэхүүн</p>
								<p class="text-foreground font-medium">{cart.count()}</p>
							</div>

							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Дэд дүн</p>
								<p class="text-foreground font-medium">₮{cart.total().toLocaleString()}</p>
							</div>

							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Хүргэлт</p>
								<p class="text-foreground font-medium">₮{deliveryFee.toLocaleString()}</p>
							</div>
						</div>

						<div class="border-border mt-4 flex items-baseline justify-between border-t pt-4">
							<p class="text-foreground font-semibold">Нийт дүн</p>
							<p class="font-display text-foreground text-2xl md:text-3xl">
								₮{(cart.total() + deliveryFee).toLocaleString()}
							</p>
						</div>
						<a class={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")} href="/checkout">
							Худалдан авах
						</a>
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default CartList;
