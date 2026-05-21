import IconShoppingBag from "~icons/ri/shopping-bag-3-line";

const EmptyCart = () => {
	return (
		<div class="flex flex-col items-center justify-center py-16 md:py-24">
			<div class="max-w-md border-4 border-border bg-card p-8 text-center shadow-hard-xl md:p-12">
				<div class="mb-6 inline-flex h-24 w-24 items-center justify-center border-4 border-border bg-muted">
					<IconShoppingBag class="h-12 w-12 text-muted-foreground" />
				</div>
				<h2 class="mb-3 font-black text-2xl uppercase md:text-3xl">
					Сагс хоосон байна
				</h2>
				<p class="mb-6 font-bold text-muted-foreground">
					Та одоогоор ямар ч бүтээгдэхүүн нэмээгүй байна
				</p>
				<a
					href="/products/"
					class="inline-flex h-12 items-center justify-center border-4 border-border bg-primary px-8 py-3 font-black text-base text-primary-foreground uppercase tracking-wider shadow-hard-lg transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:bg-primary/90 hover:shadow-hard active:scale-[0.98]"
				>
					Дэлгүүр үзэх
				</a>
			</div>
		</div>
	);
};

export default EmptyCart;
