import { For, Show } from "solid-js";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconSearch from "~icons/ri/search-line";
import IconSparkle from "~icons/ri/sparkling-fill";

const ProductCardSkeleton = () => (
	<div class="flex animate-pulse flex-col border-2 border-border bg-card shadow-hard-sm transition-all sm:border-3 sm:shadow-hard lg:shadow-hard-lg">
		<div class="relative aspect-4/5 overflow-hidden border-border border-b-2 bg-muted sm:border-b-3">
			<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.05)_2px,transparent_0)] bg-size-[14px_14px]" />
			<div class="absolute right-1.5 bottom-1.5 h-3 w-10 border-2 border-border bg-muted shadow-hard-sm sm:right-2 sm:bottom-2 sm:h-4 sm:w-12 lg:right-3 lg:bottom-3 lg:h-5 lg:w-16" />
		</div>
		<div class="flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-2.5 lg:gap-2 lg:p-3">
			<div class="h-3 w-full rounded bg-muted sm:h-3.5 lg:h-4" />
			<div class="h-3 w-3/4 rounded bg-muted sm:h-3.5 lg:h-4" />
		</div>
		<div class="flex items-center justify-between border-border border-t-2 bg-primary/10 px-2 py-1.5 sm:border-t-3 sm:px-2.5 sm:py-2 lg:px-3 lg:py-2.5">
			<div class="h-3.5 w-14 rounded bg-muted sm:h-4 sm:w-16 lg:h-5 lg:w-20" />
			<div class="h-7 w-9 border-2 border-border bg-muted shadow-hard-sm sm:h-8 sm:w-11 lg:h-9 lg:w-14" />
		</div>
	</div>
);

export function ProductSkeletonGrid(props: { count: number; class?: string }) {
	return (
		<div class={props.class ?? "grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"}>
			<For each={Array(props.count)}>{() => <ProductCardSkeleton />}</For>
		</div>
	);
}

export function ProductEmptyState(props: {
	hasActiveFilters: boolean;
	onClearFilters: () => void;
}) {
	return (
		<div class="py-8 text-center sm:py-10 lg:py-14">
			<div class="mb-3 flex justify-center sm:mb-4 lg:mb-5">
				<IconSearch class="h-12 w-12 text-muted-foreground/30 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
			</div>
			<Show
				when={props.hasActiveFilters}
				fallback={
					<>
						<h3 class="mb-2 font-black text-base sm:mb-2.5 sm:text-lg lg:text-xl">Бүтээгдэхүүн олдсонгүй</h3>
						<p class="px-4 text-muted-foreground/70 text-xs sm:text-sm lg:text-base">Одоогоор бүтээгдэхүүн байхгүй байна</p>
					</>
				}
			>
				<h3 class="mb-2 font-black text-base sm:mb-2.5 sm:text-lg lg:text-xl">Үр дүн олдсонгүй</h3>
				<p class="mb-4 px-4 text-muted-foreground/70 text-xs sm:mb-5 sm:text-sm lg:mb-6 lg:text-base">Таны шүүлтүүрт тохирох бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилж үзнэ үү.</p>
				<button type="button" onClick={props.onClearFilters} class="mx-auto min-h-[44px] border-2 border-border bg-primary px-4 py-2.5 font-bold text-xs uppercase shadow-hard-sm transition-all active:translate-x-px active:translate-y-px active:shadow-none sm:px-5 sm:py-3 sm:text-sm lg:px-6 lg:py-3.5 lg:text-base">
					Бүх шүүлтүүр цэвэрлэх
				</button>
			</Show>
		</div>
	);
}

export function ProductErrorState(props: { onRetry?: () => void }) {
	return (
		<div class="py-8 text-center sm:py-10">
			<div class="mb-3 flex justify-center sm:mb-4">
				<IconErrorWarning class="h-10 w-10 text-destructive sm:h-12 sm:w-12" />
			</div>
			<p class="font-bold text-base text-destructive sm:text-lg">Алдаа гарлаа</p>
			<p class="mt-1 text-muted-foreground/70 text-xs sm:text-sm">Дахин оролдох уу?</p>
			<Show when={props.onRetry}>
				<button
					type="button"
					onClick={props.onRetry}
					class="mt-4 inline-flex h-11 min-w-[44px] items-center justify-center border-2 border-border bg-card px-5 font-bold text-xs uppercase shadow-hard-sm transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none active:scale-95"
				>
					Дахин оролдох
				</button>
			</Show>
		</div>
	);
}

export function ProductListEnd(props: { count: number }) {
	return (
		<div class="mt-4 py-4 text-center sm:mt-6 sm:py-5 lg:mt-8 lg:py-6">
			<span class="flex items-center justify-center gap-2 font-bold text-muted-foreground/80 text-xs uppercase tracking-wide sm:text-sm lg:text-base">
				<IconSparkle class="text-yellow-500" /> Нийт {props.count} бүтээгдэхүүн
			</span>
		</div>
	);
}
