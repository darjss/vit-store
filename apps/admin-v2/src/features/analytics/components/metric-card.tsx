/*
 * Glance metric card — the variant-B `b-metric` pattern: a small icon, a
 * short label, and one prominent value. Three of these sit side by side even
 * on the phone. Values use the compact formatter so big amounts stay short;
 * the card is min-w-0 with wrapping text (no nowrap), so long Mongolian
 * labels and very large values wrap inside the card instead of pushing the
 * layout sideways at 320px.
 */
import type { JSX } from "solid-js";

interface MetricCardProps {
	icon: JSX.Element;
	label: string;
	value: string;
}

export function MetricCard(props: MetricCardProps) {
	return (
		<div class="min-w-0 rounded-ui border border-rule bg-surface p-2 shadow-card sm:p-3">
			<div class="flex items-center gap-1.5 text-ink-2">
				<span aria-hidden="true" class="size-4 shrink-0">
					{props.icon}
				</span>
				<p class="font-bold text-xs leading-snug">{props.label}</p>
			</div>
			<p class="mt-1.5 font-extrabold text-base text-ink tabular-nums tracking-tight sm:text-xl">
				{props.value}
			</p>
		</div>
	);
}
