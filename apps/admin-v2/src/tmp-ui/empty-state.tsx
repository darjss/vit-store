// TODO: SWAP TO @vit/ui — temporary local stub.
// Empty state: says what this place is and points forward (better-writing).
import type { JSX } from "solid-js";

import { cn } from "@/lib/utils";

export function EmptyState(props: {
	icon?: JSX.Element;
	title: string;
	description?: string;
	action?: JSX.Element;
	class?: string;
}) {
	return (
		<div
			class={cn(
				"flex flex-col items-center gap-3 rounded-[12px] border border-rule border-dashed bg-surface px-6 py-12 text-center shadow-card",
				props.class,
			)}
		>
			{props.icon && (
				<div
					class="grid size-12 place-items-center rounded-[10px] bg-surface-2 text-ink-2 [&_svg]:size-6"
					aria-hidden="true"
				>
					{props.icon}
				</div>
			)}
			<div class="space-y-1">
				<h2 class="font-extrabold text-base text-ink">{props.title}</h2>
				{props.description && (
					<p class="mx-auto max-w-sm text-[13px] text-ink-2 leading-relaxed">
						{props.description}
					</p>
				)}
			</div>
			{props.action}
		</div>
	);
}
