/*
 * Low-stock products — full cards for the products the home payload flags.
 * The badge is derived from the real stock value (0 → Дууссан, else Бага
 * үлдэгдэл) — never a fabricated number. Each card opens the product detail.
 */

import { BoxMinimalisticIcon } from "@solar-icons/solid/linear/box-minimalistic";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DangerCircleIcon } from "@solar-icons/solid/linear/danger-circle";
import { Link } from "@tanstack/solid-router";
import { Badge, EmptyState } from "@vit/ui";
import { For, Show } from "solid-js";

import { mnt } from "@/features/orders/labels";
import type { HomeLowStockProduct } from "../queries";

interface LowStockProductsProps {
	products: HomeLowStockProduct[];
}

/** Status badge from the real stock value (text + icon, never colour alone). */
function LowStockBadge(props: { stock: number }) {
	if (props.stock === 0) {
		return (
			<Badge tone="coral" icon={<CloseCircleIcon />}>
				Дууссан
			</Badge>
		);
	}
	return (
		<Badge tone="apricot" icon={<DangerCircleIcon />}>
			Бага үлдэгдэл
		</Badge>
	);
}

export function LowStockProducts(props: LowStockProductsProps) {
	return (
		<section aria-label="Бага үлдэгдэл бараа">
			<div class="mb-2 flex items-end justify-between gap-3">
				<div>
					<h2 class="font-extrabold text-[15px]">Бага үлдэгдэл бараа</h2>
					<p class="text-[13px] text-ink-2">Нөөц нөхөх шаардлагатай бараа</p>
				</div>
				<Link
					to="/products"
					class="shrink-0 pb-0.5 font-bold text-[13px] text-ink underline decoration-rule underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
				>
					Бүгдийг харах
				</Link>
			</div>

			<Show when={props.products.length === 0}>
				<EmptyState
					icon={<BoxMinimalisticIcon />}
					title="Бага үлдэгдэл бараа байхгүй"
					description="Бүх барааны нөөц хангалттай байна."
				/>
			</Show>

			<Show when={props.products.length > 0}>
				<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
					<For each={props.products}>
						{(product) => (
							<article class="flex items-center gap-3 rounded-2xl border border-rule bg-surface p-3 shadow-card">
								<Link
									to="/products/$productId"
									params={{ productId: String(product.productId) }}
									class="shrink-0 rounded-[9px] bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
									aria-label={`${product.name} — дэлгэрэнгүй`}
								>
									<Show
										when={product.imageUrl}
										fallback={
											<div
												class="grid size-12 place-items-center text-ink-2/40"
												aria-hidden="true"
											>
												<BoxMinimalisticIcon class="size-6" />
											</div>
										}
									>
										{(url) => (
											<img
												src={url()}
												alt=""
												loading="lazy"
												class="size-12 rounded-[9px] border border-ink/5 object-cover"
											/>
										)}
									</Show>
								</Link>
								<div class="min-w-0 flex-1">
									<Link
										to="/products/$productId"
										params={{ productId: String(product.productId) }}
										class="line-clamp-2 font-bold text-[13.5px] leading-[1.35] hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
									>
										{product.name}
									</Link>
									<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
										<span class="font-extrabold text-sm tabular-nums">
											{mnt(product.price)}
										</span>
										<LowStockBadge stock={product.stock} />
									</div>
									<p class="mt-1 text-ink-2 text-xs">
										Үлдэгдэл:{" "}
										<span class="font-bold tabular-nums">{product.stock}</span>
									</p>
								</div>
							</article>
						)}
					</For>
				</div>
			</Show>
		</section>
	);
}
