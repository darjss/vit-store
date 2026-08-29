import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { cn } from "@/lib/utils";

/**
 * One pending vocabulary for checkout + payment.
 * Enter pops once; only the ring spins. No second track, dual rings, or wobble.
 */
export function WorkingStatus(props: {
	label: string;
	hint?: string;
	icon?: JSX.Element;
	/** `inline` = button row; `stack` = panel center */
	layout?: "inline" | "stack";
	class?: string;
}) {
	const stacked = () => (props.layout ?? "inline") === "stack";

	return (
		<span
			class={cn(
				"working-status",
				stacked()
					? "flex flex-col items-center gap-3 text-center"
					: "inline-flex items-center justify-center gap-2.5",
				props.class,
			)}
			aria-busy="true"
			aria-live="polite"
		>
			<span
				class={cn(
					"relative grid shrink-0 place-items-center",
					stacked() ? "size-16 text-cocoa" : "size-5",
				)}
				aria-hidden="true"
			>
				<span
					class={cn(
						"working-spinner absolute inset-0 rounded-full border-current/20 border-t-current",
						stacked() ? "border-[3px]" : "border-2",
					)}
				/>
				<Show when={props.icon}>
					{(icon) => (
						<span
							class={cn(
								"grid place-items-center",
								stacked() && "working-status-icon",
								stacked() ? "[&_svg]:size-6" : "[&_svg]:size-3",
							)}
						>
							{icon()}
						</span>
					)}
				</Show>
			</span>
			<span class={stacked() ? "space-y-1" : undefined}>
				<span
					class={cn(
						"block font-semibold leading-tight",
						stacked() ? "text-sm" : "text-sm sm:text-base",
					)}
				>
					{props.label}
				</span>
				<Show when={props.hint}>
					{(hint) => (
						<span class="block text-muted-foreground text-xs">{hint()}</span>
					)}
				</Show>
			</span>
		</span>
	);
}
