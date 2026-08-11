/*
 * Home — loading and error states (design rules: loading/empty/error/retry
 * everywhere data loads). Never surface a raw library or DB message.
 */
import { RefreshCircleIcon } from "@solar-icons/solid/linear/refresh-circle";
import { Button, EmptyState, Skeleton } from "@vit/ui";
import { For } from "solid-js";

/** Full-page loading skeleton matching the home section order. */
export function HomeSkeleton() {
	return (
		<div class="space-y-7" aria-hidden="true">
			{/* next-action strip */}
			<Skeleton class="h-[92px] w-full rounded-2xl" />

			{/* glance cards */}
			<div class="grid grid-cols-3 gap-2.5">
				<For each={Array.from({ length: 3 })}>
					{() => (
						<div class="space-y-2 rounded-ui border border-rule bg-surface p-3">
							<Skeleton class="h-6 w-2/3" />
							<Skeleton class="h-3.5 w-full" />
						</div>
					)}
				</For>
			</div>

			{/* work queue */}
			<div class="space-y-3">
				<Skeleton class="h-5 w-40" />
				<div class="space-y-2.5">
					<For each={Array.from({ length: 2 })}>
						{() => (
							<div class="space-y-2.5 rounded-2xl border border-rule bg-surface p-3.5">
								<div class="flex items-center gap-2.5">
									<Skeleton class="size-9 shrink-0 rounded-[9px]" />
									<div class="flex-1 space-y-1.5">
										<Skeleton class="h-4 w-24" />
										<Skeleton class="h-3.5 w-32" />
									</div>
									<Skeleton class="h-4 w-16" />
								</div>
								<Skeleton class="h-11 w-full rounded-[9px]" />
							</div>
						)}
					</For>
				</div>
			</div>

			{/* sections */}
			<div class="space-y-3">
				<Skeleton class="h-5 w-44" />
				<div class="space-y-2.5">
					<For each={Array.from({ length: 2 })}>
						{() => <Skeleton class="h-[72px] w-full rounded-2xl" />}
					</For>
				</div>
			</div>
		</div>
	);
}

/** Home error state with retry — the whole payload failed to load. */
export function HomeErrorState(props: { onRetry?: () => void }) {
	return (
		<EmptyState
			icon={<RefreshCircleIcon />}
			title="Нүүрийг ачаалах боломжгүй"
			description="Анхаарах ажил, захиалга, нөөцийн мэдээллийг ачааллаж чадсангүй. Дахин оролдоно уу."
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
