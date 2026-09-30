import { For, Show } from "solid-js";
import { MinimalisticMagnifierIcon as IconSearch } from "@solar-icons/solid/linear";
import {
	DangerCircleIcon as IconErrorWarning,
	StarsIcon as IconSparkle,
} from "@solar-icons/solid/bold";

const ProductCardSkeleton = () => (
	<div class="border-border bg-card shadow-soft flex animate-pulse flex-col overflow-hidden rounded-2xl border">
		<div class="bg-muted aspect-4/5" />
		<div class="flex flex-1 flex-col gap-1.5 p-3">
			<div class="bg-muted h-2.5 w-1/3 rounded" />
			<div class="bg-muted h-3.5 w-full rounded" />
			<div class="bg-muted h-3.5 w-3/4 rounded" />
			<div class="mt-auto flex items-end justify-between pt-2">
				<div class="bg-muted h-4 w-14 rounded sm:h-5 sm:w-16" />
				<div class="bg-muted h-11 w-11 rounded-full" />
			</div>
		</div>
	</div>
);

export function ProductSkeletonGrid(props: { class?: string; count: number }) {
	return (
		<div
			class={
				props.class ?? "grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
			}
		>
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
				<IconSearch class="text-muted-foreground/30 h-12 w-12 sm:h-14 sm:w-14 lg:h-16 lg:w-16" />
			</div>
			<Show
				fallback={
					<>
						<h3 class="mb-2 text-base font-extrabold sm:mb-2.5 sm:text-lg lg:text-xl">
							Бүтээгдэхүүн олдсонгүй
						</h3>
						<p class="text-muted-foreground/70 px-4 text-xs sm:text-sm lg:text-base">
							Одоогоор бүтээгдэхүүн байхгүй байна
						</p>
					</>
				}
				when={props.hasActiveFilters}
			>
				<h3 class="mb-2 text-base font-extrabold sm:mb-2.5 sm:text-lg lg:text-xl">
					Үр дүн олдсонгүй
				</h3>
				<p class="text-muted-foreground/70 mb-4 px-4 text-xs sm:mb-5 sm:text-sm lg:mb-6 lg:text-base">
					Таны шүүлтүүрт тохирох бүтээгдэхүүн олдсонгүй. Шүүлтүүрээ өөрчилж үзнэ үү.
				</p>
				<button
					class="bg-primary shadow-lift hover:shadow-lift-lg mx-auto min-h-[44px] rounded-full px-5 py-2.5 text-sm font-bold transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] sm:px-6 sm:py-3"
					onClick={props.onClearFilters}
					type="button"
				>
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
				<IconErrorWarning class="text-destructive h-10 w-10 sm:h-12 sm:w-12" />
			</div>
			<p class="text-destructive text-base font-bold sm:text-lg">Алдаа гарлаа</p>
			<p class="text-muted-foreground/70 mt-1 text-xs sm:text-sm">Дахин оролдох уу?</p>
			<Show when={props.onRetry}>
				<button
					class="border-border bg-card shadow-soft-sm hover:shadow-soft mt-4 inline-flex h-11 min-w-[44px] items-center justify-center rounded-full border px-5 text-sm font-semibold transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]"
					onClick={props.onRetry}
					type="button"
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
			<span class="text-muted-foreground/80 flex items-center justify-center gap-2 text-xs font-semibold sm:text-sm">
				<IconSparkle class="text-primary-deep" /> Нийт {props.count} бүтээгдэхүүн
			</span>
		</div>
	);
}
