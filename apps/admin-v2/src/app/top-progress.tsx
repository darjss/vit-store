import { useRouterState } from "@tanstack/solid-router";
import { Show } from "solid-js";

// Thin butter bar shown while the router transitions. Indeterminate sweep;
// the global reduced-motion rule collapses it to a static hint.
export function TopProgress() {
	const isLoading = useRouterState({
		select: (s) => s.isLoading,
	});
	return (
		<div
			class="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden"
			aria-hidden="true"
		>
			<Show when={isLoading()}>
				<div
					class="h-full w-1/3 rounded-full bg-butter"
					style={{ animation: "top-progress 1.1s var(--ease-in-out) infinite" }}
				/>
			</Show>
		</div>
	);
}
