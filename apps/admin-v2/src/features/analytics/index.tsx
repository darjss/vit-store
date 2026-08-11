/*
 * Analytics page — variant-B glance sections, Mongolian-first.
 *
 * Sections: date-range control (URL state), three key metrics, visitor trend
 * (PostHog-backed — unavailable state on failure, never zeros), top brands,
 * and the low-stock attention list. Every data surface has loading, empty,
 * error, and retry states; the snapshot shows its cache freshness.
 *
 * Range switching is pure URL state: every query key carries the timeRange,
 * so changing daily / weekly / monthly refetches all related values together.
 */

import { ClockCircleIcon } from "@solar-icons/solid/linear/clock-circle";
import { MoneyBagIcon } from "@solar-icons/solid/linear/money-bag";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { RepeatIcon } from "@solar-icons/solid/linear/repeat";
import { WalletMoneyIcon } from "@solar-icons/solid/linear/wallet-money";
import { createQuery } from "@tanstack/solid-query";
import { useNavigate, useSearch } from "@tanstack/solid-router";
import { Button, InlineAlert, Skeleton } from "@vit/ui";
import { createMemo, For, Show } from "solid-js";
import { LowStockSection } from "./components/low-stock-section";
import { MetricCard } from "./components/metric-card";
import { RangeControl } from "./components/range-control";
import { TopBrands } from "./components/top-brands";
import { TrendSection } from "./components/trend-section";
import {
	compactMnt,
	compactNumber,
	freshnessText,
	RANGE_DESCRIPTIONS,
} from "./labels";
import type { AnalyticsRange } from "./queries";
import { analyticsSnapshotQueryOptions } from "./queries";

const ANALYTICS_RANGES: readonly AnalyticsRange[] = [
	"daily",
	"weekly",
	"monthly",
];

/** Read `?range=` from the URL; anything unknown falls back to daily. */
function readRange(raw: unknown): AnalyticsRange {
	return typeof raw === "string" &&
		(ANALYTICS_RANGES as readonly string[]).includes(raw)
		? (raw as AnalyticsRange)
		: "daily";
}

export function AnalyticsPage() {
	const rawSearch = useSearch({ from: "/_app/analytics" });
	const navigate = useNavigate();

	const timeRange = createMemo(() =>
		readRange((rawSearch() as Record<string, unknown>)?.range),
	);
	const snapshot = createQuery(() =>
		analyticsSnapshotQueryOptions(timeRange()),
	);

	const setRange = (range: AnalyticsRange) => {
		if (range === timeRange()) return;
		navigate({ to: "/analytics", search: { range } });
	};

	return (
		<div class="grid gap-5">
			<header class="grid gap-3">
				<h1 class="font-extrabold text-2xl text-ink tracking-tight">
					Шинжилгээ
				</h1>
				<p class="text-[13px] text-ink-2">{RANGE_DESCRIPTIONS[timeRange()]}</p>
				<RangeControl value={timeRange()} onChange={setRange} />
			</header>

			{/* Snapshot: loading / error / success */}
			<Show when={snapshot.isPending}>
				<div class="grid gap-2.5">
					<div class="grid grid-cols-3 gap-2.5">
						<For each={[0, 1, 2]}>
							{() => <Skeleton class="h-20 w-full rounded-ui" />}
						</For>
					</div>
					<Skeleton class="h-64 w-full rounded-ui" />
					<Skeleton class="h-40 w-full rounded-ui" />
				</div>
			</Show>

			<Show when={snapshot.isError && !snapshot.isFetching}>
				<div class="grid gap-2">
					<InlineAlert
						tone="error"
						title="Шинжилгээний мэдээлэл ачаалж чадсангүй"
					>
						Холболтоо шалгаад дахин оролдоно уу.
					</InlineAlert>
					<Button
						variant="secondary"
						class="w-full"
						onClick={() => snapshot.refetch()}
					>
						<RefreshIcon /> Дахин оролдох
					</Button>
				</div>
			</Show>

			<Show when={snapshot.data}>
				{(data) => (
					<div class="grid gap-5">
						{/* Cache freshness — snapshot time in the business timezone */}
						<p class="flex items-center gap-1.5 text-ink-2 text-xs">
							<ClockCircleIcon class="size-3.5 shrink-0" />
							Шинэчлэгдсэн: {freshnessText(data().lastUpdated)}
						</p>

						{/* Three key metrics — all range-scoped, all refetch together */}
						<div class="grid grid-cols-3 gap-2.5">
							<MetricCard
								icon={<WalletMoneyIcon />}
								label="Дундаж захиалга"
								value={compactMnt(data().averageOrderValue)}
							/>
							<MetricCard
								icon={<MoneyBagIcon />}
								label="Нийт ашиг"
								value={compactMnt(data().totalProfit)}
							/>
							<MetricCard
								icon={<RepeatIcon />}
								label="Давтан үйлчлүүлэгч"
								value={compactNumber(data().repeatCustomers)}
							/>
						</div>

						<TrendSection timeRange={timeRange()} />

						<TopBrands brands={data().topBrands} />
					</div>
				)}
			</Show>

			{/* Fresh inventory surface — independent of the snapshot */}
			<LowStockSection />
		</div>
	);
}
