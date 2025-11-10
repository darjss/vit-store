
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

export default EmptyCart;