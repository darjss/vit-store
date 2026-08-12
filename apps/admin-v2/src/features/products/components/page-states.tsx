import { RefreshCircleIcon } from "@solar-icons/solid/linear/refresh-circle";
import { Button, EmptyState, Skeleton } from "@vit/ui";
import type { JSX } from "solid-js";
import { For } from "solid-js";

export function ProductCardSkeleton() {
	return (
		<div class="rounded-2xl border border-rule bg-surface p-3 shadow-card">
			<div class="flex items-start gap-3">
				<Skeleton class="size-[68px] shrink-0 rounded-[9px]" />
				<div class="min-w-0 flex-1 space-y-2.5 pt-1">
					<Skeleton class="h-4 w-3/4" />
					<Skeleton class="h-4 w-1/3" />
					<Skeleton class="h-4 w-1/2" />
				</div>
				<Skeleton class="size-10 shrink-0 rounded-lg" />
			</div>
		</div>
	);
}

export function ProductListSkeleton(props: { count?: number }) {
	return (
		<div class="grid grid-cols-1 gap-2.5">
			<For each={Array.from({ length: props.count ?? 5 })}>
				{() => <ProductCardSkeleton />}
			</For>
		</div>
	);
}

export function ErrorState(props: {
	title?: JSX.Element;
	description?: JSX.Element;
	onRetry?: () => void;
}) {
	return (
		<EmptyState
			icon={<RefreshCircleIcon />}
			title={props.title ?? "Ачаалах боломжгүй"}
			description={
				props.description ?? "Серверийн алдаа гарлаа. Дахин оролдоно уу."
			}
			action={
				props.onRetry ? (
					<Button variant="secondary" onClick={props.onRetry}>
						Дахин оролдох
					</Button>
				) : undefined
			}
		/>
	);
}
