/*
 * Hand-rolled SVG trend view — the approved Track 6 fallback (no chart
 * library, no new dependencies; can be promoted into @vit/ui later).
 *
 * Responsive width via viewBox + preserveAspectRatio="none"; the stroke keeps
 * a constant visual weight with vector-effect="non-scaling-stroke". The value
 * facts render as visible text next to the drawing, and the SVG carries a
 * descriptive aria-label, so the trend never relies on the drawing alone.
 * The chart is static — no animation — so prefers-reduced-motion is naturally
 * respected.
 */
import { For, Show } from "solid-js";

export interface TrendPoint {
	/** Day label from the source series ("2025-09-12"). */
	label: string;
	value: number;
}

interface TrendChartProps {
	points: TrendPoint[];
	/** Formats a value for the facts strip ("12 зочин"). */
	formatValue: (value: number) => string;
	/** Formats a day label ("9 сарын 12"). */
	formatLabel: (label: string) => string;
	/** Series name for the accessible label ("зочид"). */
	seriesName: string;
}

const W = 600;
const H = 170;
const PAD = 8;

export function TrendChart(props: TrendChartProps) {
	const first = () => props.points[0];
	const last = () => props.points[props.points.length - 1];
	const maxPoint = () =>
		props.points.reduce(
			(best, point) => (point.value > best.value ? point : best),
			first(),
		);
	const minPoint = () =>
		props.points.reduce(
			(best, point) => (point.value < best.value ? point : best),
			first(),
		);

	const peak = () => Math.max(maxPoint().value, 1);
	const stepX = () => (W - PAD * 2) / (props.points.length - 1);
	const yFor = (value: number) => H - PAD - (value / peak()) * (H - PAD * 2);

	const linePath = () =>
		props.points
			.map(
				(point, index) =>
					`${index === 0 ? "M" : "L"}${(PAD + index * stepX()).toFixed(2)} ${yFor(
						point.value,
					).toFixed(2)}`,
			)
			.join(" ");
	const areaPath = () =>
		`${linePath()} L${(W - PAD).toFixed(2)} ${(H - PAD).toFixed(2)} L${PAD} ${(H - PAD).toFixed(2)} Z`;

	const ariaSummary = () =>
		`${props.seriesName}: ${props.formatValue(last().value)} ${props.formatLabel(
			last().label,
		)}. Хамгийн их: ${props.formatValue(maxPoint().value)} ${props.formatLabel(
			maxPoint().label,
		)}. Хамгийн бага: ${props.formatValue(minPoint().value)} ${props.formatLabel(
			minPoint().label,
		)}.`;

	// A single data point has no line to draw — show the value as a stat.
	// An empty series renders nothing (callers show their own empty state).
	return (
		<Show
			when={props.points.length >= 2}
			fallback={
				<Show when={props.points.length === 1}>
					<div class="rounded-ui border border-rule bg-surface p-4 shadow-card">
						<p class="font-extrabold text-2xl text-ink tabular-nums tracking-tight">
							{props.formatValue(first().value)}
						</p>
						<p class="mt-1 text-ink-2 text-xs">
							{props.formatLabel(first().label)}
						</p>
					</div>
				</Show>
			}
		>
			<figure class="grid grid-cols-1 gap-2.5 rounded-ui border border-rule bg-surface p-4 shadow-card">
				<div class="min-w-0">
					<svg
						viewBox={`0 0 ${W} ${H}`}
						preserveAspectRatio="none"
						class="h-36 w-full"
						role="img"
						aria-label={ariaSummary()}
					>
						<title>{ariaSummary()}</title>
						<defs>
							<linearGradient
								id="analytics-trend-fill"
								x1="0"
								y1="0"
								x2="0"
								y2="1"
							>
								<stop
									offset="0%"
									stop-color="var(--color-ink)"
									stop-opacity="0.14"
								/>
								<stop
									offset="100%"
									stop-color="var(--color-ink)"
									stop-opacity="0.02"
								/>
							</linearGradient>
						</defs>
						{/* baseline */}
						<line
							x1={PAD}
							y1={H - PAD}
							x2={W - PAD}
							y2={H - PAD}
							class="stroke-rule"
							stroke-width="1"
							vector-effect="non-scaling-stroke"
						/>
						<path d={areaPath()} fill="url(#analytics-trend-fill)" />
						<path
							d={linePath()}
							fill="none"
							class="stroke-ink"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
							vector-effect="non-scaling-stroke"
						/>
					</svg>
					<div class="flex justify-between text-[11px] text-ink-2">
						<span>{props.formatLabel(first().label)}</span>
						<span>{props.formatLabel(last().label)}</span>
					</div>
				</div>
				{/* Accessible text summary alongside the drawing */}
				<dl class="grid grid-cols-3 gap-2 border-rule border-t pt-2.5 text-center">
					<For each={["last", "max", "min"]}>
						{(key) => {
							const point = () =>
								key === "last"
									? last()
									: key === "max"
										? maxPoint()
										: minPoint();
							const title =
								key === "last"
									? "Сүүлийн"
									: key === "max"
										? "Хамгийн их"
										: "Хамгийн бага";
							return (
								<div>
									<dt class="text-[11px] text-ink-2">{title}</dt>
									<dd class="mt-0.5 font-bold text-ink text-sm tabular-nums">
										{props.formatValue(point().value)}
									</dd>
									<dd class="text-[11px] text-ink-2">
										{props.formatLabel(point().label)}
									</dd>
								</div>
							);
						}}
					</For>
				</dl>
			</figure>
		</Show>
	);
}
