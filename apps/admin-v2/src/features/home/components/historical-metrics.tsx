/*
 * Small historical metrics — real values only from the home payload (revenue
 * and order count for the requested range). No hard-coded growth percentages,
 * no percentage walls; the caption names the range.
 */

import { BillListIcon } from "@solar-icons/solid/linear/bill-list";
import { WalletIcon } from "@solar-icons/solid/linear/wallet";
import { Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";

import { mnt } from "@/features/orders/labels";

interface HistoricalMetricsProps {
	revenue: number;
	orderCount: number;
	timeRangeLabel: string;
}

function MetricCard(props: {
	label: string;
	value: string;
	icon: JSX.Element;
}) {
	return (
		<div class="rounded-2xl border border-rule bg-surface p-3.5 shadow-card">
			<span
				class="mb-2 flex items-center gap-1.5 font-bold text-ink-2 text-xs"
				aria-hidden="true"
			>
				{props.icon}
				{props.label}
			</span>
			<p class="truncate font-extrabold text-lg tabular-nums">{props.value}</p>
		</div>
	);
}

export function HistoricalMetrics(props: HistoricalMetricsProps) {
	return (
		<section aria-label="Үзүүлэлт">
			<div class="mb-2 flex items-end justify-between gap-3">
				<div>
					<h2 class="font-extrabold text-[15px]">Үзүүлэлт</h2>
					<p class="text-[13px] text-ink-2">{props.timeRangeLabel}</p>
				</div>
				<Link
					to="/analytics"
					class="shrink-0 pb-0.5 font-bold text-[13px] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				>
					Шинжилгээ
				</Link>
			</div>
			<div class="grid grid-cols-2 gap-2.5">
				<MetricCard
					label="Орлого"
					value={mnt(props.revenue)}
					icon={<WalletIcon class="size-4" />}
				/>
				<MetricCard
					label="Захиалга"
					value={new Intl.NumberFormat("mn-MN").format(props.orderCount)}
					icon={<BillListIcon class="size-4" />}
				/>
			</div>
		</section>
	);
}
