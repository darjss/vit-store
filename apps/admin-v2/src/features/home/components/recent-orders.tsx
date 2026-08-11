/*
 * Recent orders — the newest orders as cards. Number, customer, total and
 * status badges only — NO product images on home cards (design rules).
 * Each card opens the order detail.
 */

import { BillListIcon } from "@solar-icons/solid/linear/bill-list";
import { Link } from "@tanstack/solid-router";
import { EmptyState } from "@vit/ui";
import { For, Show } from "solid-js";

import { mnt, whenText } from "@/features/orders/labels";
import {
	OrderStatusBadge,
	PaymentStatusBadge,
} from "@/features/orders/status-badge";
import type { HomeRecentOrder } from "../queries";

interface RecentOrdersProps {
	orders: HomeRecentOrder[];
}

export function RecentOrders(props: RecentOrdersProps) {
	return (
		<section aria-label="Сүүлийн захиалга">
			<div class="mb-2 flex items-end justify-between gap-3">
				<div>
					<h2 class="font-extrabold text-[15px]">Сүүлийн захиалга</h2>
					<p class="text-[13px] text-ink-2">Хамгийн сүүлд орсон захиалгууд</p>
				</div>
				<Link
					to="/orders"
					class="shrink-0 pb-0.5 font-bold text-[13px] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				>
					Бүгдийг харах
				</Link>
			</div>

			<Show when={props.orders.length === 0}>
				<EmptyState
					icon={<BillListIcon />}
					title="Захиалга байхгүй"
					description="Шинэ захиалга орж ирэнгүүт энд харагдана."
				/>
			</Show>

			<Show when={props.orders.length > 0}>
				<div class="space-y-2.5">
					<For each={props.orders}>
						{(order) => (
							<article class="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-card">
								<span
									class="grid size-10 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-ink"
									aria-hidden="true"
								>
									<BillListIcon class="size-5" />
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
										<Link
											to="/orders/$orderId"
											params={{ orderId: order.orderNumber }}
											class="font-extrabold text-[15px] tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
										>
											{order.orderNumber}
										</Link>
										<span class="truncate text-[13px] text-ink-2">
											{order.customerPhone} · {order.products.length} бараа
										</span>
									</div>
									<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
										<PaymentStatusBadge status={order.paymentStatus} />
										<OrderStatusBadge status={order.status} />
									</div>
								</div>
								<div class="shrink-0 text-right">
									<div class="font-extrabold text-[15px] tabular-nums">
										{mnt(order.total)}
									</div>
									<div class="mt-0.5 text-ink-2 text-xs tabular-nums">
										{whenText(order.createdAt)}
									</div>
								</div>
							</article>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
