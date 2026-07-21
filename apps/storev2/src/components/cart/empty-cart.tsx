import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import IconShoppingBag from "~icons/ri/shopping-bag-3-line";

const EmptyCart = () => {
	return (
		<div class="enter-rise flex flex-col items-center justify-center px-6 py-14 text-center md:py-20">
			<div class="relative mb-6">
				<div class="flex size-24 items-center justify-center rounded-full bg-wash-peach">
					<IconShoppingBag
						class="h-10 w-10 text-cocoa"
						aria-hidden="true"
					/>
				</div>
				<Badge
					variant="sticker"
					class="-rotate-6 -top-2 -right-6 absolute"
				>
					Хоосон!
				</Badge>
			</div>

			<h2 class="mb-2 font-display text-foreground text-xl md:text-2xl">
				Сагс хоосон байна
			</h2>
			<p class="mb-6 max-w-xs text-muted-foreground text-sm leading-relaxed">
				Танд хэрэгтэй витаминууд дэлгүүрт хүлээж байна. Эрүүл өдрөө эндээс
				эхлүүлээрэй.
			</p>

			<a href="/products/" class={cn(buttonVariants({ size: "lg" }))}>
				Дэлгүүр үзэх
			</a>
		</div>
	);
};

export default EmptyCart;
