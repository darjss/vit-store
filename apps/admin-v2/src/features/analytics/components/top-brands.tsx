/*
 * Top brands by sales — from the DB-backed analytics snapshot (limit 5).
 * The snapshot exposes brand names and totals only (no brand ids), so rows
 * are informational; the section header links to the products list as the
 * useful next screen. A proportional bar shows each brand's share of the
 * leading brand's sales.
 */

import { CrownIcon } from "@solar-icons/solid/linear/crown";
import { Link } from "@tanstack/solid-router";
import { EmptyState } from "@vit/ui";
import { For, Show } from "solid-js";

import { formatCount, mnt } from "../labels";
import type { AnalyticsSnapshotData } from "../queries";

interface TopBrandsProps {
	brands: AnalyticsSnapshotData["topBrands"];
}

export function TopBrands(props: TopBrandsProps) {
	const maxTotal = () =>
		props.brands.reduce((max, brand) => Math.max(max, brand.total), 0);

	return (
		<section aria-labelledby="top-brands-heading" class="grid gap-2.5">
			<div class="flex items-end justify-between gap-2">
				<div>
					<h2
						id="top-brands-heading"
						class="font-extrabold text-[15px] text-ink"
					>
						Шилдэг брэндүүд
					</h2>
					<p class="text-ink-2 text-xs">Борлуулалтын дүнгээр эрэмбэлэв</p>
				</div>
				<Link
					to="/products"
					class="shrink-0 font-bold text-[13px] text-ink underline-offset-2 hover:underline focus-visible:underline"
				>
					Бараа руу
				</Link>
			</div>

			<Show
				when={props.brands.length > 0}
				fallback={
					<EmptyState
						icon={<CrownIcon />}
						title="Энэ хугацаанд борлуулалт байхгүй"
						description="Борлуулалт гарч ирэхэд шилдэг брэндүүд энд харагдана."
					/>
				}
			>
				<ol class="grid gap-2">
					<For each={props.brands}>
						{(brand, index) => (
							<li class="flex items-center gap-3 rounded-ui border border-rule bg-surface p-3 shadow-card">
								<span
									aria-hidden="true"
									class={`grid size-8 shrink-0 place-items-center rounded-lg font-extrabold text-sm ${
										index() === 0
											? "bg-butter text-butter-ink"
											: "bg-surface-2 text-ink-2"
									}`}
								>
									{index() + 1}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline justify-between gap-3">
										<p class="truncate font-bold text-ink text-sm">
											{brand.brandName}
										</p>
										<p class="shrink-0 font-extrabold text-ink text-sm tabular-nums">
											{mnt(brand.total)}
										</p>
									</div>
									<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
										<div
											class="h-full rounded-full bg-ink/25"
											style={{
												width: `${maxTotal() > 0 ? (brand.total / maxTotal()) * 100 : 0}%`,
											}}
										/>
									</div>
									<p class="mt-1 text-ink-2 text-xs">
										{formatCount(brand.quantity)} ширхэг борлуулсан
									</p>
								</div>
							</li>
						)}
					</For>
				</ol>
			</Show>
		</section>
	);
}
