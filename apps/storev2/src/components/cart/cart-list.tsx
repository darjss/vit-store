import { Image } from "@unpic/solid";
import { deliveryFee } from "@vit/shared/constants";
import { For, Match, Switch } from "solid-js";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { washBg } from "@/lib/wash";
import { cart } from "@/store/cart";
import Loading from "../loading";
import CartActions from "./cart-actions";
import EmptyCart from "./empty-cart";

const CartList = () => {
	const isEmpty = () => cart.items().length === 0;
	const isHydrated = () => cart.isHydrated();

	return (
		<Switch>
			<Match when={!isHydrated()}>
				<Loading />
			</Match>
			<Match when={isHydrated() && isEmpty()}>
				<EmptyCart />
			</Match>
			<Match when={isHydrated() && !isEmpty()}>
				<h1 class="enter-fade mb-5 font-display text-foreground text-xl md:text-2xl">
					Таны сагс
				</h1>
				<div class="flex w-full flex-col gap-3">
					<For each={cart.items()}>
						{(item, index) => (
							<div
								class={cn(
									"enter-rise rounded-2xl border border-border bg-card p-4 shadow-soft md:p-5",
									index() < 8 && `stagger-${index() + 1}`,
								)}
							>
								<div class="hidden md:flex md:items-center md:gap-6">
									<div class="flex w-1/2 items-center gap-5">
										<a
											href={`/products/${item.slug}-${item.productId}/`}
											class={cn(
												"block size-24 flex-shrink-0 overflow-hidden rounded-xl",
												washBg(item.productId),
											)}
										>
											<Image
												src={item.image}
												alt={`${item.name} `}
												width={96}
												height={96}
												layout="fixed"
												class="h-full w-full object-cover object-center"
											/>
										</a>
										<div class="flex-1">
											<a href={`/products/${item.slug}-${item.productId}/`}>
												<h2 class="font-semibold text-foreground text-lg transition-colors duration-[140ms] ease-out hover:text-cocoa">
													{item.name}
												</h2>
											</a>
											<p class="mt-1 text-muted-foreground text-sm">
												₮{item.price.toLocaleString()} / ширхэг
											</p>
										</div>
									</div>

									<div class="flex w-1/4 justify-center">
										<CartActions
											quantity={() => item.quantity}
											productId={item.productId}
										/>
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
											href={`/products/${item.slug}-${item.productId}/`}
											class={cn(
												"block size-24 flex-shrink-0 overflow-hidden rounded-xl",
												washBg(item.productId),
											)}
										>
											<Image
												src={item.image}
												alt={`${item.name}`}
												width={96}
												height={96}
												layout="fixed"
												class="h-full w-full object-cover object-center"
											/>
										</a>
										<div class="flex flex-1 flex-col justify-between">
											<a href={`/products/${item.slug}-${item.productId}/`}>
												<h2 class="font-semibold text-base text-foreground leading-snug">
													{item.name}
												</h2>
											</a>
											<p class="text-muted-foreground text-xs">
												₮{item.price.toLocaleString()} / ширхэг
											</p>
										</div>
									</div>

									<div class="flex items-center justify-between border-border border-t pt-3">
										<CartActions
											quantity={() => item.quantity}
											productId={item.productId}
										/>

										<div class="font-display text-foreground text-lg">
											₮{(item.price * item.quantity).toLocaleString()}
										</div>
									</div>
								</div>
							</div>
						)}
					</For>
				</div>
				<div class="enter-rise stagger-3 mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft md:p-8">
					<div class="md:ml-auto md:w-2/3 lg:w-1/2">
						<h2 class="mb-5 border-border border-b pb-3 font-display text-foreground text-lg">
							Захиалгын дүн
						</h2>

						<div class="space-y-3">
							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Нийт бүтээгдэхүүн</p>
								<p class="font-medium text-foreground">{cart.count()}</p>
							</div>

							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Дэд дүн</p>
								<p class="font-medium text-foreground">
									₮{cart.total().toLocaleString()}
								</p>
							</div>

							<div class="flex items-center justify-between text-sm">
								<p class="text-muted-foreground">Хүргэлт</p>
								<p class="font-medium text-foreground">
									₮{deliveryFee.toLocaleString()}
								</p>
							</div>
						</div>

						<div class="mt-4 flex items-baseline justify-between border-border border-t pt-4">
							<p class="font-semibold text-foreground">Нийт дүн</p>
							<p class="font-display text-2xl text-foreground md:text-3xl">
								₮{(cart.total() + deliveryFee).toLocaleString()}
							</p>
						</div>
						<a
							href="/checkout"
							class={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}
						>
							Худалдан авах
						</a>
					</div>
				</div>
			</Match>
		</Switch>
	);
};

export default CartList;
