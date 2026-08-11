/*
 * Next-action strip — the dark hero of the approved variant-B home screen.
 * Shows the single most urgent work item (the newest pending order, or the
 * low-stock group when no order is waiting) and one primary action that
 * navigates to the right screen. Home never mutates — every action navigates.
 */
import { useNavigate } from "@tanstack/solid-router";
import { Button } from "@vit/ui";
import { Show } from "solid-js";

import { mnt, ORDER_STATUS_META } from "@/features/orders/labels";
import type { HomeLowStockProduct, HomePendingOrder } from "../queries";

interface NextActionStripProps {
	pendingOrders: HomePendingOrder[];
	lowStockProducts: HomeLowStockProduct[];
}

export function NextActionStrip(props: NextActionStripProps) {
	const navigate = useNavigate();

	const nextOrder = () => props.pendingOrders[0];
	const hasNextOrder = () => nextOrder() !== undefined;
	const lowStockCount = () => props.lowStockProducts.length;

	const openOrder = () => {
		const order = nextOrder();
		if (!order) return;
		void navigate({
			to: "/orders/$orderId",
			params: { orderId: order.orderNumber },
		});
	};

	const openProducts = () => {
		void navigate({ to: "/products" });
	};

	return (
		<Show when={hasNextOrder() || lowStockCount() > 0} fallback={null}>
			<section
				aria-label="Дараагийн үйлдэл"
				class="flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-2xl bg-ink px-4 py-4 text-canvas shadow-card"
			>
				<div class="min-w-0 flex-1 basis-52">
					<p class="font-extrabold text-[11px] text-white/60 uppercase tracking-[0.08em]">
						Дараагийн үйлдэл
					</p>
					<Show
						when={hasNextOrder()}
						fallback={
							<>
								<p class="mt-0.5 font-extrabold text-lg tabular-nums">
									Бага үлдэгдэл · {lowStockCount()} бараа
								</p>
								<p class="mt-0.5 text-[13px] text-white/75">
									Нөөц нөхөх шаардлагатай
								</p>
							</>
						}
					>
						<p class="mt-0.5 font-extrabold text-lg tabular-nums">
							{nextOrder()?.orderNumber} · {mnt(nextOrder()?.total ?? 0)}
						</p>
						<p class="mt-0.5 truncate text-[13px] text-white/75">
							{nextOrder()?.customerPhone} · {nextOrder()?.products.length}{" "}
							бараа ·{" "}
							{ORDER_STATUS_META[nextOrder()?.status ?? "pending"].label}
						</p>
					</Show>
				</div>
				<Show when={hasNextOrder()} fallback={null}>
					<Button onClick={openOrder} class="ml-auto shrink-0">
						Илгээх
					</Button>
				</Show>
				<Show when={!hasNextOrder() && lowStockCount() > 0}>
					<Button onClick={openProducts} class="ml-auto shrink-0">
						Нөөц нэмэх
					</Button>
				</Show>
			</section>
		</Show>
	);
}
