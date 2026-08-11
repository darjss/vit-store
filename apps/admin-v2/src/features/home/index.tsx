/*
 * Track 5 — Home feature (variant B, triage agenda).
 *
 * One payload (analytics.getHomePageData) drives the whole screen: the fresh
 * parts (pendingOrders, lowStockProducts, recentOrders) are the work queue,
 * the cached parts (revenue, orderCount, topProducts) are the small metrics.
 * Home never writes — every action navigates to the right next screen.
 */
import { createQuery } from "@tanstack/solid-query";
import { Show } from "solid-js";

import { GlanceCards } from "./components/glance-cards";
import { HistoricalMetrics } from "./components/historical-metrics";
import { LowStockProducts } from "./components/low-stock-products";
import { NextActionStrip } from "./components/next-action-strip";
import { QuickActions } from "./components/quick-actions";
import { RecentOrders } from "./components/recent-orders";
import { HomeErrorState, HomeSkeleton } from "./components/states";
import { TopProducts } from "./components/top-products";
import { WorkQueue } from "./components/work-queue";
import { HOME_TIME_RANGE, homePageQueryOptions } from "./queries";

const WEEKLY_LABEL = "Сүүлийн 7 хоног";

export function HomePage() {
	const query = createQuery(() => homePageQueryOptions(HOME_TIME_RANGE));

	// `.data` suspends while the query is loading (Solid Query resource); gate
	// every read behind isSuccess so there is no suspension without a boundary.
	const data = () => (query.isSuccess ? query.data : undefined);

	return (
		<div class="space-y-7">
			<header>
				<h1 class="font-extrabold text-2xl tracking-tight">Нүүр</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					{new Date().toLocaleDateString("mn-MN", {
						weekday: "long",
						day: "numeric",
						month: "long",
					})}
				</p>
			</header>

			<Show when={query.isPending}>
				<HomeSkeleton />
			</Show>

			<Show when={query.isError}>
				<HomeErrorState onRetry={() => void query.refetch()} />
			</Show>

			<Show when={data()}>
				{(home) => (
					<div class="space-y-7">
						<NextActionStrip
							pendingOrders={home().pendingOrders}
							lowStockProducts={home().lowStockProducts}
						/>
						<GlanceCards
							pending={home().pendingOrders.length}
							lowStock={home().lowStockProducts.length}
							orderCount={home().orderCount.count}
						/>
						<WorkQueue
							pendingOrders={home().pendingOrders}
							lowStockProducts={home().lowStockProducts}
						/>
						<RecentOrders orders={home().recentOrders} />
						<LowStockProducts products={home().lowStockProducts} />
						<QuickActions />
						<HistoricalMetrics
							revenue={home().revenue}
							orderCount={home().orderCount.count}
							timeRangeLabel={WEEKLY_LABEL}
						/>
						<TopProducts products={home().topProducts} />
					</div>
				)}
			</Show>
		</div>
	);
}
