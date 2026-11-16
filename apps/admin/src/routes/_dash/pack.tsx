import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { DashboardPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import { placedToday } from "@/lib/nav-counts";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

// Today's paid orders waiting to ship, as one shelf-picking list. Today is the Ulaanbaatar day.
// Ticks live in localStorage per order line, so both views share them.

export const Route = createFileRoute("/_dash/pack")({
	component: PackComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(ctx.trpc.order.getPendingOrders.queryOptions());
	},
	pendingComponent: DashboardPageSkeleton,
});

const storageKey = "pack-ticks";
const lineKey = (orderId: number, productId: number) => `${orderId}:${productId}`;

function useTicks() {
	const [ticks, setTicks] = useState<Record<string, boolean>>(() =>
		JSON.parse(localStorage.getItem(storageKey) ?? "{}"),
	);
	useEffect(() => localStorage.setItem(storageKey, JSON.stringify(ticks)), [ticks]);
	const set = (keys: Array<string>, value: boolean) =>
		setTicks((current) => ({ ...current, ...Object.fromEntries(keys.map((key) => [key, value])) }));
	return [ticks, set] as const;
}

function PackComponent() {
	const { data: pending } = useSuspenseQuery(trpc.order.getPendingOrders.queryOptions());
	const orders = placedToday(pending);
	const [view, setView] = useState<"product" | "order">("product");
	const [ticks, setTicks] = useTicks();

	const lines = orders.flatMap((order) =>
		order.products.map((product) => ({
			...product,
			key: lineKey(order.id, product.productId),
			order,
		})),
	);
	const products = Object.values(Object.groupBy(lines, (line) => String(line.productId))).flatMap(
		(group) => {
			if (!group?.[0]) {
				return [];
			}
			return [
				{
					...group[0],
					done: group.every((line) => ticks[line.key]),
					keys: group.map((line) => line.key),
					orders: group.length,
					quantity: group.reduce((sum, line) => sum + line.quantity, 0),
				},
			];
		},
	);
	products.sort((a, b) => Number(a.done) - Number(b.done) || b.quantity - a.quantity);

	const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0);
	const pickedItems = lines.reduce((sum, line) => sum + (ticks[line.key] ? line.quantity : 0), 0);
	const readyOrders = orders.filter((order) =>
		order.products.every((product) => ticks[lineKey(order.id, product.productId)]),
	).length;

	return (
		<div className="mx-auto max-w-2xl pb-16">
			<div className="mb-3 flex items-center gap-2">
				<p className="text-muted-foreground flex-1 text-sm">
					{orders.length} захиалга, {totalItems} бараа
				</p>
				<div className="flex border bg-white p-0.5 text-sm">
					{(["product", "order"] as const).map((option) => (
						<button
							className={cn("h-8 px-3", view === option && "bg-foreground font-medium text-white")}
							key={option}
							onClick={() => setView(option)}
							type="button"
						>
							{option === "product" ? "Бараагаар" : "Захиалгаар"}
						</button>
					))}
				</div>
			</div>

			{view === "product" ? (
				<ul className="divide-y border bg-white">
					{products.map((product) => (
						<li key={product.productId}>
							<button
								className={cn(
									"active:bg-muted flex w-full items-center gap-3 px-3 py-2 text-left",
									product.done && "opacity-45",
								)}
								onClick={() => setTicks(product.keys, !product.done)}
								type="button"
							>
								<Tick on={product.done} />
								<img alt="" className="size-11 shrink-0 object-contain" src={product.imageUrl} />
								<div className="min-w-0 flex-1">
									<p
										className={cn(
											"line-clamp-2 text-sm leading-snug",
											product.done && "line-through",
										)}
									>
										{product.name}
									</p>
									<p className="text-muted-foreground text-xs">{product.orders} захиалгад</p>
								</div>
								<span className="text-xl font-bold tabular-nums">×{product.quantity}</span>
							</button>
						</li>
					))}
				</ul>
			) : (
				<div className="space-y-2">
					{orders.map((order) => {
						const keys = order.products.map((product) => lineKey(order.id, product.productId));
						const done = keys.every((key) => ticks[key]);
						return (
							<section className={cn("border bg-white", done && "opacity-60")} key={order.id}>
								<Link
									className="flex items-center gap-2 border-b px-3 py-2"
									params={{ id: String(order.id) }}
									to="/orders/$id"
								>
									<span className="text-sm font-semibold">{order.orderNumber}</span>
									<span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
										{order.address}
									</span>
									{done && <span className="bg-primary px-1.5 text-xs font-semibold">Бэлэн</span>}
									<ChevronRight className="text-muted-foreground size-4" />
								</Link>
								<ul className="divide-y">
									{order.products.map((product) => {
										const key = lineKey(order.id, product.productId);
										return (
											<li key={key}>
												<button
													className="active:bg-muted flex w-full items-center gap-3 px-3 py-1.5 text-left"
													onClick={() => setTicks([key], !ticks[key])}
													type="button"
												>
													<Tick on={Boolean(ticks[key])} />
													<img
														alt=""
														className="size-9 shrink-0 object-contain"
														src={product.imageUrl}
													/>
													<p
														className={cn(
															"min-w-0 flex-1 truncate text-sm",
															ticks[key] && "text-muted-foreground line-through",
														)}
													>
														{product.name}
													</p>
													<span className="font-semibold tabular-nums">×{product.quantity}</span>
												</button>
											</li>
										);
									})}
								</ul>
							</section>
						);
					})}
				</div>
			)}

			<div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-30 border-t bg-white md:bottom-0 md:left-(--sidebar-width)">
				<div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-2">
					<div className="flex-1">
						<p className="text-sm font-semibold tabular-nums">
							{pickedItems} / {totalItems} бараа авсан
						</p>
						<p className="text-muted-foreground text-xs">{readyOrders} захиалга бэлэн</p>
					</div>
					<button
						className="text-muted-foreground h-9 px-2 text-sm"
						onClick={() => setTicks(Object.keys(ticks), false)}
						type="button"
					>
						Цэвэрлэх
					</button>
					<Link
						className="bg-foreground flex h-10 items-center px-4 text-sm font-medium text-white"
						search={{ orderStatus: "pending" }}
						to="/orders"
					>
						Илгээх
					</Link>
				</div>
			</div>
		</div>
	);
}

function Tick({ on }: { on: boolean }) {
	return (
		<span
			className={cn(
				"flex size-6 shrink-0 items-center justify-center border",
				on ? "border-foreground bg-foreground text-white" : "border-muted-foreground/40 bg-white",
			)}
		>
			{on && <Check className="size-4" strokeWidth={3} />}
		</span>
	);
}
