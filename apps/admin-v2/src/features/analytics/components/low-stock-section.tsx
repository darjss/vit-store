/*
 * Low-stock / attention section — getLowInventoryProducts (never cached
 * server-side, contract §4, so restocks show up fast). Every row is a link
 * to the product detail — the useful next screen. Status badges follow the
 * approved palette: 0 → "Дууссан" (coral), <10 → "Бага үлдэгдэл" (apricot),
 * each with text + icon, never colour alone.
 */

import { BoxIcon } from "@solar-icons/solid/linear/box";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DangerCircleIcon } from "@solar-icons/solid/linear/danger-circle";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { createQuery } from "@tanstack/solid-query";
import { Link } from "@tanstack/solid-router";
import { Badge, Button, EmptyState, InlineAlert, Skeleton } from "@vit/ui";
import { For, Show } from "solid-js";

import { mnt } from "../labels";
import { lowInventoryQueryOptions } from "../queries";

const LOW_STOCK_THRESHOLD = 10;

export function LowStockSection() {
	const lowInventoryQuery = createQuery(() => lowInventoryQueryOptions());

	// `.data` is undefined until the query succeeds — gate every read through
	// this accessor so there is no suspension or undefined access.
	const items = () =>
		lowInventoryQuery.isSuccess ? lowInventoryQuery.data : [];

	const lowStockCount = () =>
		items().filter((item) => item.stock > 0 && item.stock < LOW_STOCK_THRESHOLD)
			.length;
	const outOfStockCount = () =>
		items().filter((item) => item.stock === 0).length;

	return (
		<section aria-labelledby="low-stock-heading" class="grid gap-2.5">
			<div class="flex items-end justify-between gap-2">
				<div>
					<h2
						id="low-stock-heading"
						class="font-extrabold text-[15px] text-ink"
					>
						Нөөц нөхөх бараа
					</h2>
					<p class="text-ink-2 text-xs">Хамгийн бага үлдэгдэлтэй</p>
				</div>
				<Show when={lowInventoryQuery.isSuccess}>
					<p class="shrink-0 font-bold text-ink-2 text-xs tabular-nums">
						{outOfStockCount() > 0 ? `${outOfStockCount()} дууссан · ` : ""}
						{lowStockCount()} бага
					</p>
				</Show>
			</div>

			<Show when={lowInventoryQuery.isPending}>
				<div class="grid gap-2">
					<For each={[0, 1, 2]}>
						{() => <Skeleton class="h-16 w-full rounded-ui" />}
					</For>
				</div>
			</Show>

			<Show when={lowInventoryQuery.isError && !lowInventoryQuery.isFetching}>
				<div class="grid gap-2">
					<InlineAlert
						tone="error"
						title="Бага үлдэгдэл барааг ачаалж чадсангүй"
					>
						Холболтоо шалгаад дахин оролдоно уу.
					</InlineAlert>
					<Button
						variant="secondary"
						class="w-full"
						onClick={() => lowInventoryQuery.refetch()}
					>
						<RefreshIcon /> Дахин оролдох
					</Button>
				</div>
			</Show>

			<Show when={lowInventoryQuery.isSuccess}>
				<Show
					when={items().length > 0}
					fallback={
						<EmptyState
							icon={<BoxIcon />}
							title="Бага үлдэгдэл бараа байхгүй"
							description="Нөөц сайн байна. Барааны жагсаалтаас нөөцийг шалгаж болно."
							action={
								<Link
									to="/products"
									class="inline-flex h-12 items-center justify-center rounded-ui bg-butter px-5 font-bold text-butter-ink text-sm shadow-lift"
								>
									Бараа руу
								</Link>
							}
						/>
					}
				>
					<div class="grid gap-2">
						<For each={items()}>
							{(item) => {
								const out = item.stock === 0;
								return (
									<Link
										to="/products/$productId"
										params={{ productId: String(item.productId) }}
										class="flex items-center gap-3 rounded-ui border border-rule bg-surface p-3 shadow-card hover:border-ink/25 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
									>
										{item.imageUrl ? (
											<img
												src={item.imageUrl}
												alt=""
												loading="lazy"
												class="size-12 shrink-0 rounded-lg bg-surface-2 object-cover"
											/>
										) : (
											<span
												aria-hidden="true"
												class="grid size-12 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2"
											>
												<BoxIcon class="size-5" />
											</span>
										)}
										<div class="min-w-0 flex-1">
											<p class="truncate font-bold text-ink text-sm">
												{item.name}
											</p>
											<p class="mt-0.5 text-ink-2 text-xs">{mnt(item.price)}</p>
										</div>
										<div class="shrink-0 text-right">
											<p
												class={`font-extrabold text-lg tabular-nums ${
													out ? "text-coral-ink" : "text-ink"
												}`}
											>
												{item.stock}
											</p>
											<Badge
												tone={out ? "coral" : "apricot"}
												icon={out ? <CloseCircleIcon /> : <DangerCircleIcon />}
											>
												{out ? "Дууссан" : "Бага үлдэгдэл"}
											</Badge>
										</div>
									</Link>
								);
							}}
						</For>
					</div>
				</Show>
			</Show>
		</section>
	);
}
