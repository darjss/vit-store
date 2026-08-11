/*
 * Visitor trend section — PostHog-backed getDailyVisitorTrend.
 *
 * Contract §4: this procedure THROWS on PostHog failure (no fabricated
 * zero-filled fallback), so the section renders an explicit unavailable
 * state with a retry path — never zeros. Genuinely empty series (no
 * storefront events in the window) are real data and get an empty state.
 */

import { EyeIcon } from "@solar-icons/solid/linear/eye";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { createQuery } from "@tanstack/solid-query";
import { Button, EmptyState, InlineAlert, Skeleton } from "@vit/ui";
import { Show } from "solid-js";

import { compactNumber, trendDayLabel } from "../labels";
import type { AnalyticsRange } from "../queries";
import { visitorTrendQueryOptions } from "../queries";
import type { TrendPoint } from "./trend-chart";
import { TrendChart } from "./trend-chart";

interface TrendSectionProps {
	timeRange: AnalyticsRange;
}

export function TrendSection(props: TrendSectionProps) {
	const trendQuery = createQuery(() =>
		visitorTrendQueryOptions(props.timeRange),
	);

	const points = (): TrendPoint[] =>
		trendQuery.isSuccess
			? trendQuery.data.map((row) => ({
					label: row.date,
					value: row.visitors,
				}))
			: [];

	return (
		<section aria-labelledby="trend-heading" class="grid gap-2.5">
			<div>
				<h2 id="trend-heading" class="font-extrabold text-[15px] text-ink">
					Зочдын чиг хандлага
				</h2>
				<p class="text-ink-2 text-xs">Өдөр бүрийн зочилсон хэрэглэгчийн тоо</p>
			</div>

			<Show when={trendQuery.isPending}>
				<Skeleton class="h-64 w-full rounded-ui" />
			</Show>

			<Show when={trendQuery.isError && !trendQuery.isFetching}>
				<div class="grid gap-2">
					<InlineAlert
						tone="error"
						title="Зочдын чиг хандлага одоогоор авах боломжгүй"
					>
						Вэб аналитикийн үйлчилгээ холбогдохгүй байна. Дахин оролдоно уу.
					</InlineAlert>
					<Button
						variant="secondary"
						class="w-full"
						onClick={() => trendQuery.refetch()}
					>
						<RefreshIcon /> Дахин оролдох
					</Button>
				</div>
			</Show>

			<Show when={trendQuery.isSuccess}>
				<Show
					when={points().length > 0}
					fallback={
						<EmptyState
							icon={<EyeIcon />}
							title="Энэ хугацаанд зочилсон хэрэглэгч байхгүй"
							description="Дэлгүүрт зочилсон хэрэглэгч гарч ирэхэд чиг хандлага энд харагдана."
						/>
					}
				>
					<TrendChart
						points={points()}
						seriesName="зочид"
						formatValue={(value) => `${compactNumber(value)} зочин`}
						formatLabel={trendDayLabel}
					/>
				</Show>
			</Show>
		</section>
	);
}
