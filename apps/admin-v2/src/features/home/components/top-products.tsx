/*
 * Top products — compact rows for the last 30 days (server-fixed monthly
 * window). Rank, name, units sold and revenue, all real values from the
 * payload. Each row opens the product detail (topProducts carries productId).
 */

import { CupStarIcon } from "@solar-icons/solid/linear/cup-star";
import { Link } from "@tanstack/solid-router";
import { EmptyState } from "@vit/ui";
import { For, Show } from "solid-js";

import { mnt } from "@/features/orders/labels";
import type { HomeTopProduct } from "../queries";

interface TopProductsProps {
	products: HomeTopProduct[];
}

export function TopProducts(props: TopProductsProps) {
	return (
		<section aria-label="Топ борлуулалт">
			<div class="mb-2 flex items-end justify-between gap-3">
				<div>
					<h2 class="font-extrabold text-[15px]">Топ борлуулалттай бараа</h2>
					<p class="text-[13px] text-ink-2">Сүүлийн 30 хоног</p>
				</div>
			</div>

			<Show when={props.products.length === 0}>
				<EmptyState
					icon={<CupStarIcon />}
					title="Борлуулалтын мэдээлэл байхгүй"
					description="Энэ хугацаанд борлуулалт бүртгэгдээгүй байна."
				/>
			</Show>

			<Show when={props.products.length > 0}>
				<div class="space-y-2.5">
					<For each={props.products}>
						{(product, index) => (
							<Link
								to="/products/$productId"
								params={{ productId: String(product.productId) }}
								class="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3 shadow-card transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
							>
								<span
									class="grid size-8 shrink-0 place-items-center rounded-lg bg-butter/25 font-extrabold text-butter-ink text-sm tabular-nums"
									aria-hidden="true"
								>
									{index() + 1}
								</span>
								<div class="min-w-0 flex-1">
									<p class="line-clamp-2 font-bold text-[13px] leading-snug">
										{product.name}
									</p>
									<p class="mt-0.5 text-ink-2 text-xs">
										{product.totalSold} ширхэг
									</p>
								</div>
								<div class="shrink-0 text-right font-extrabold text-[13px] tabular-nums">
									{mnt(product.revenue)}
								</div>
							</Link>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
