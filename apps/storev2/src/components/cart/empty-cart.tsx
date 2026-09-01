import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bag3Icon as IconShoppingBag } from "@solar-icons/solid/linear";

const EmptyCart = () => {
	return (
		<div class="enter-rise flex flex-col items-center justify-center px-6 py-14 text-center md:py-20">
			<div class="relative mb-6">
				<div class="bg-wash-peach flex size-24 items-center justify-center rounded-full">
					<IconShoppingBag aria-hidden="true" class="text-cocoa h-10 w-10" />
				</div>
				<Badge class="absolute -top-2 -right-6 -rotate-6" variant="sticker">
					Хоосон!
				</Badge>
			</div>

			<h2 class="font-display text-foreground mb-2 text-xl md:text-2xl">Сагс хоосон байна</h2>
			<p class="text-muted-foreground mb-6 max-w-xs text-sm leading-relaxed">
				Танд хэрэгтэй витаминууд дэлгүүрт хүлээж байна. Эрүүл өдрөө эндээс эхлүүлээрэй.
			</p>

			<a class={cn(buttonVariants({ size: "lg" }))} href="/products/">
				Дэлгүүр үзэх
			</a>
		</div>
	);
};

export default EmptyCart;
