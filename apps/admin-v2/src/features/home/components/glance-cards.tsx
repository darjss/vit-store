/*
 * Glance cards — the small metric row of the approved variant-B home.
 * Three quick-scan values: the two fresh queue counts plus the 7-day order
 * count. Each card is a link to the matching screen.
 */
import { Link } from "@tanstack/solid-router";

interface GlanceCardsProps {
	pending: number;
	lowStock: number;
	orderCount: number;
}

const cardClass =
	"min-w-0 rounded-ui border border-rule bg-surface p-3 shadow-card transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

export function GlanceCards(props: GlanceCardsProps) {
	return (
		<div class="grid grid-cols-3 gap-2.5">
			<Link to="/orders" search={{ orderStatus: "pending" }} class={cardClass}>
				<b class="block font-extrabold text-xl tabular-nums">{props.pending}</b>
				<span class="mt-0.5 block font-bold text-ink-2 text-xs leading-tight">
					Бэлтгэлд
				</span>
			</Link>
			<Link to="/products" class={cardClass}>
				<b class="block font-extrabold text-xl tabular-nums">
					{props.lowStock}
				</b>
				<span class="mt-0.5 block font-bold text-ink-2 text-xs leading-tight">
					Бага үлдэгдэл
				</span>
			</Link>
			<Link to="/orders" class={cardClass}>
				<b class="block font-extrabold text-xl tabular-nums">
					{props.orderCount}
				</b>
				<span class="mt-0.5 block font-bold text-ink-2 text-xs leading-tight">
					7 хоногийн захиалга
				</span>
			</Link>
		</div>
	);
}
