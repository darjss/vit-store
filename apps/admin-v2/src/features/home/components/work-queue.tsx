/*
 * Work queue — "Анхаарах ажил". The fresh part of the home payload: pending
 * orders (each with one primary action) and the low-stock group. Every item
 * navigates to the right next screen (order detail / products list); home
 * never mutates, so the primary action is always navigation.
 */

import { BoxIcon } from "@solar-icons/solid/linear/box";
import { DangerCircleIcon } from "@solar-icons/solid/linear/danger-circle";
import { Link, useNavigate } from "@tanstack/solid-router";
import { Button, EmptyState } from "@vit/ui";
import { For, Show } from "solid-js";

import { mnt, whenText } from "@/features/orders/labels";
import {
	OrderStatusBadge,
	PaymentStatusBadge,
} from "@/features/orders/status-badge";
import type { HomeLowStockProduct, HomePendingOrder } from "../queries";

interface WorkQueueProps {
	pendingOrders: HomePendingOrder[];
	lowStockProducts: HomeLowStockProduct[];
}

export function WorkQueue(props: WorkQueueProps) {
	const navigate = useNavigate();

	const total = () =>
		props.pendingOrders.length + props.lowStockProducts.length;

	const openOrder = (orderNumber: string) => {
		void navigate({
			to: "/orders/$orderId",
			params: { orderId: orderNumber },
		});
	};

	return (
		<section aria-label="Анхаарах ажил">
			<div class="mb-2 flex items-baseline gap-2">
				<h2 class="font-extrabold text-[15px]">Анхаарах ажил</h2>
				<span class="text-[13px] text-ink-2">({total()} ажил)</span>
			</div>

			<Show when={total() === 0}>
				<EmptyState
					icon={<BoxIcon />}
					title="Бүх ажил дууссан"
					description="Шинэ захиалга болон бага үлдэгдэл бараа байхгүй байна."
				/>
			</Show>

			<Show when={total() > 0}>
				<div class="space-y-2.5">
					<For each={props.pendingOrders}>
						{(order) => (
							<article class="space-y-2.5 rounded-2xl border border-rule bg-surface p-3.5 shadow-card">
								<div class="flex items-center gap-2.5">
									<span
										class="grid size-9 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-ink"
										aria-hidden="true"
									>
										<BoxIcon class="size-[17px]" />
									</span>
									<div class="min-w-0 flex-1">
										<Link
											to="/orders/$orderId"
											params={{ orderId: order.orderNumber }}
											class="block truncate font-extrabold text-[15px] tabular-nums hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
										>
											{order.orderNumber}
										</Link>
										<p class="truncate text-[13px] text-ink-2">
											{order.customerPhone} · {order.products.length} бараа
										</p>
									</div>
									<div class="shrink-0 font-extrabold text-[15px] tabular-nums">
										{mnt(order.total)}
									</div>
								</div>
								<div class="flex flex-wrap items-center gap-1.5">
									<PaymentStatusBadge status={order.paymentStatus} />
									<OrderStatusBadge status={order.status} />
									<span class="ml-auto text-ink-2 text-xs tabular-nums">
										{whenText(order.createdAt)}
									</span>
								</div>
								<Button
									class="w-full"
									onClick={() => openOrder(order.orderNumber)}
								>
									Илгээх
								</Button>
							</article>
						)}
					</For>

					<Show when={props.lowStockProducts.length > 0}>
						<article class="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3.5 shadow-card">
							<span
								class="grid size-9 shrink-0 place-items-center rounded-[9px] bg-coral/15 text-coral-ink"
								aria-hidden="true"
							>
								<DangerCircleIcon class="size-[17px]" />
							</span>
							<div class="min-w-0 flex-1">
								<p class="font-bold text-[15px]">Бага үлдэгдэл</p>
								<p class="text-[13px] text-ink-2">
									{props.lowStockProducts.length} бараа · нөөц нөхөх
									шаардлагатай
								</p>
							</div>
							<Button
								variant="secondary"
								class="shrink-0"
								onClick={() => void navigate({ to: "/products" })}
							>
								Нөөц нэмэх
							</Button>
						</article>
					</Show>
				</div>
			</Show>
		</section>
	);
}
