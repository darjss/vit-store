import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

/*
 * Empty state — says what this place is and points forward. The title renders
 * as an h3 so the empty state keeps the page outline coherent; keep it inside
 * a section whose h2 names the list.
 */
type EmptyStateProps = {
	class?: string;
	icon?: JSX.Element;
	title: JSX.Element;
	description?: JSX.Element;
	action?: JSX.Element;
};

const EmptyState = (props: EmptyStateProps) => {
	const [local, others] = splitProps(props, [
		"class",
		"icon",
		"title",
		"description",
		"action",
	]);
	return (
		<div
			class={cn(
				"flex flex-col items-center justify-center gap-3 rounded-2xl border border-rule border-dashed bg-surface px-6 py-12 text-center",
				local.class,
			)}
			{...others}
		>
			{local.icon ? (
				<div
					aria-hidden="true"
					class="grid size-12 place-items-center rounded-xl bg-surface-2 text-ink-2"
				>
					{local.icon}
				</div>
			) : null}
			<h3 class="font-bold text-base text-ink">{local.title}</h3>
			{local.description ? (
				<p class="max-w-sm text-ink-2 text-sm leading-relaxed">
					{local.description}
				</p>
			) : null}
			{local.action ? <div class="mt-2">{local.action}</div> : null}
		</div>
	);
};

export { EmptyState };
export type { EmptyStateProps };
