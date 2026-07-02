import { For, Show } from "solid-js";
import IconErrorWarning from "~icons/ri/error-warning-line";
import IconSearch from "~icons/ri/search-line";
import IconSparkle from "~icons/ri/sparkling-fill";

const ProductCardSkeleton = () => (
	<div class="flex animate-pulse flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
		<div class="aspect-4/5 bg-muted" />
		<div class="flex flex-1 flex-col gap-1.5 p-3">
			<div class="h-2.5 w-1/3 rounded bg-muted" />
			<div class="h-3.5 w-full rounded bg-muted" />
			<div class="h-3.5 w-3/4 rounded bg-muted" />
			<div class="mt-auto flex items-end justify-between pt-2">
				<div class="h-4 w-14 rounded bg-muted sm:h-5 sm:w-16" />
				<div class="h-11 w-11 rounded-full bg-muted" />
			</div>
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
						<h3 class="mb-2 font-extrabold text-base sm:mb-2.5 sm:text-lg lg:text-xl">Бүтээгдэхүүн олдсонгүй</h3>
						<p class="px-4 text-muted-foreground/70 text-xs sm:text-sm lg:text-base">Одоогоор бүтээгдэхүүн байхгүй байна</p>
					</>
				}
			>
				<h3 class="mb-2 font-extrabold text-base sm:mb-2.5 sm:text-lg lg:text-xl">Үр дүн олдсонгүй</h3>
				<p class="mb-4 px-4 text-muted-foreground/70 text-xs sm:mb-5 sm:text-sm lg:mb-6 lg:text-base">Таны шүүлтүүрт тохирох бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилж үзнэ үү.</p>
				<button type="button" onClick={props.onClearFilters} class="mx-auto min-h-[44px] rounded-full bg-primary px-5 py-2.5 font-bold text-sm shadow-lift transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift-lg active:scale-[0.97] sm:px-6 sm:py-3">
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
					class="mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border border-border bg-card px-5 font-semibold text-sm shadow-soft-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft active:scale-[0.97]"
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
			<span class="flex items-center justify-center gap-2 font-semibold text-muted-foreground/80 text-xs sm:text-sm">
				<IconSparkle class="text-primary-deep" /> Нийт {props.count} бүтээгдэхүүн
			</span>
		</div>
	);
}
