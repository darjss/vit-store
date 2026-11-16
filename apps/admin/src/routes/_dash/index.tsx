import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck, Search, Truck } from "lucide-react";
import { useState } from "react";
import { StockStepper } from "@/components/product/stock-stepper";
import { DashboardPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import { cn } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const seriesQuery = trpc.sales.dailySeries.queryOptions({ days: 62 });
const shippedQuery = trpc.order.getPaginatedOrders.queryOptions({
	orderStatus: "shipped",
	page: 1,
	pageSize: 1,
});
const topQuery = trpc.sales.topProducts.queryOptions({ productCount: 5, timeRange: "weekly" });
const inventoryQuery = trpc.sales.inventoryValue.queryOptions();

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(seriesQuery);
		void ctx.queryClient.prefetchQuery(ctx.trpc.sales.sameTimeLastWeek.queryOptions());
		void ctx.queryClient.prefetchQuery(ctx.trpc.order.getPendingOrders.queryOptions());
		void ctx.queryClient.prefetchQuery(shippedQuery);
		void ctx.queryClient.prefetchQuery(topQuery);
		void ctx.queryClient.prefetchQuery(inventoryQuery);
	},
	pendingComponent: DashboardPageSkeleton,
});

const money = (value: number) => `${value.toLocaleString("en-US")}₮`;
const short = (value: number) =>
	value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)} сая₮` : `${Math.round(value / 1000)}k₮`;
const weekdays = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
const ubDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" });
const dayKey = (offset: number) => ubDay.format(new Date(Date.now() + offset * 86_400_000));
const weekdayOf = (key: string) => weekdays[new Date(`${key}T12:00:00`).getDay()];

type Day = { orders: number; profit: number; revenue: number };
const empty: Day = { orders: 0, profit: 0, revenue: 0 };
const add = (a: Day, b: Day) => ({
	orders: a.orders + b.orders,
	profit: a.profit + b.profit,
	revenue: a.revenue + b.revenue,
});

function HomeComponent() {
	const { data: series } = useSuspenseQuery(seriesQuery);
	const { data: sameTime } = useSuspenseQuery(trpc.sales.sameTimeLastWeek.queryOptions());
	const { data: pending } = useSuspenseQuery(trpc.order.getPendingOrders.queryOptions());
	const { data: shipped } = useSuspenseQuery(shippedQuery);
	const { data: top } = useSuspenseQuery(topQuery);
	const { data: inventory } = useSuspenseQuery(inventoryQuery);
	const [picked, setPicked] = useState<string>();

	const byDay = new Map(series.map((row) => [row.day, row]));
	const at = (offset: number): Day => byDay.get(dayKey(offset)) ?? empty;
	const sum = (from: number, to: number) => {
		let total = empty;
		for (let offset = from; offset >= to; offset--) {
			total = add(total, at(offset));
		}
		return total;
	};

	const todayKey = dayKey(0);
	const [year = 0, month = 0, date = 0] = todayKey.split("-").map(Number);
	const today = at(0);
	const week = sum(0, -6);
	const prevWeek = sum(-7, -13);
	const monthToDate = sum(0, -(date - 1));
	const prevMonthDays = new Date(year, month - 1, 0).getDate();
	const prevMonthStart = -(date - 1) - prevMonthDays;
	const prevMonthToDate = sum(prevMonthStart + Math.min(date, prevMonthDays) - 1, prevMonthStart);

	const bars = Array.from({ length: 30 }, (_, i) => {
		const key = dayKey(i - 29);
		return { key, ...(byDay.get(key) ?? empty) };
	});
	const maxRevenue = Math.max(1, ...bars.map((bar) => bar.revenue));
	const pickedBar = bars.find((bar) => bar.key === picked);

	const items = pending.reduce(
		(total, order) => total + order.products.reduce((n, product) => n + product.quantity, 0),
		0,
	);

	return (
		<div className="mx-auto grid max-w-5xl grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
			<section className="border bg-white lg:col-start-1 lg:row-start-1">
				<div className="px-4 pt-3">
					<p className="text-muted-foreground text-xs">
						Өнөөдөр, {weekdayOf(todayKey)} {month}/{date}
					</p>
					<div className="mt-1 flex items-end gap-3">
						<p className="text-3xl leading-none font-bold tabular-nums">{money(today.revenue)}</p>
						<Delta base={sameTime.revenue} value={today.revenue} />
					</div>
					<p className="text-muted-foreground mt-1.5 text-sm">
						{today.orders} захиалга · ашиг {money(today.profit)}
					</p>
					<p className="text-muted-foreground text-xs">
						Өнгөрсөн {weekdayOf(dayKey(-7))} энэ цаг хүртэл {money(sameTime.revenue)},{" "}
						{sameTime.orders} захиалга
					</p>
				</div>

				<div className="px-4 pt-4">
					<div className="flex h-16 items-end gap-[3px]">
						{bars.map((bar) => (
							<button
								aria-label={`${bar.key} ${money(bar.revenue)}`}
								className="flex h-full flex-1 items-end"
								key={bar.key}
								onClick={() => setPicked(bar.key === picked ? undefined : bar.key)}
								type="button"
							>
								<span
									className={cn(
										"w-full",
										bar.key === todayKey ? "bg-foreground" : "bg-input",
										bar.key === picked && "bg-primary outline outline-1 outline-black",
									)}
									style={{ height: `${Math.max(3, (bar.revenue / maxRevenue) * 100)}%` }}
								/>
							</button>
						))}
					</div>
					<p className="text-muted-foreground mt-1.5 h-5 text-xs">
						{pickedBar
							? `${pickedBar.key.slice(5).replace("-", "/")} ${weekdayOf(pickedBar.key)} · ${money(pickedBar.revenue)} · ${pickedBar.orders} захиалга`
							: "Сүүлийн 30 хоног, баганыг дарж өдрийг харна"}
					</p>
				</div>

				<div className="mt-2 grid grid-cols-2 divide-x border-t">
					<Period base={prevWeek} label="7 хоног" note="өмнөх 7 хоногоос" value={week} />
					<Period
						base={prevMonthToDate}
						label="Энэ сар"
						note={`өмнөх сарын ${Math.min(date, prevMonthDays)} хүртэлхээс`}
						value={monthToDate}
					/>
				</div>
			</section>

			{/* Mom's two jobs sit right under today on a phone, and in the right column on a laptop. */}
			<div className="space-y-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:space-y-4">
				<section className="border bg-white p-4">
					<p className="text-base font-semibold">
						{pending.length} захиалга илгээхэд бэлэн
						<span className="text-muted-foreground font-normal"> · {items} бараа</span>
					</p>
					<div className="mt-3 grid grid-cols-2 gap-2">
						<Link
							className="bg-primary flex h-12 items-center justify-center gap-2 border border-black font-semibold"
							to="/pack"
						>
							<ClipboardCheck className="size-5" />
							Савлах
						</Link>
						<Link
							className="flex h-12 items-center justify-center gap-2 border border-black bg-white font-semibold"
							search={{ orderStatus: "pending" }}
							to="/orders"
						>
							<Truck className="size-5" />
							Илгээх
						</Link>
					</div>
					<Link
						className="text-muted-foreground mt-3 flex items-center text-sm"
						search={{ orderStatus: "shipped" }}
						to="/orders"
					>
						<span className="flex-1">
							{Number(shipped.pagination.totalCount)} захиалга хүргэлтэд явж байна
						</span>
						<ChevronRight className="size-4" />
					</Link>
				</section>

				<section className="border bg-white">
					<Link className="flex items-start gap-3 px-4 pt-3" to="/products">
						<div className="flex-1">
							<p className="text-muted-foreground text-xs">Агуулахад байгаа барааны үнэ</p>
							<p className="mt-1 text-2xl leading-none font-bold tabular-nums">
								{money(inventory.retail)}
							</p>
						</div>
						<ChevronRight className="text-muted-foreground mt-1 size-4" />
					</Link>
					<div className="mt-3 grid grid-cols-3 divide-x border-t text-center">
						<Stat label="ширхэг" value={inventory.units.toLocaleString("en-US")} />
						<Stat label="төрөл" value={String(inventory.skus)} />
						{/* Products have no cost column, so cost comes from each product's last sale. */}
						<Stat
							label={`өртөг, ${inventory.costed}/${inventory.skus} төрөл`}
							value={short(inventory.cost)}
						/>
					</div>
				</section>

				<StockFixer />
			</div>

			<section className="border bg-white lg:col-start-1 lg:row-start-2">
				<h2 className="text-muted-foreground border-b px-4 py-2 text-xs font-medium tracking-wide uppercase">
					7 хоногт их зарагдсан
				</h2>
				<ul className="divide-y">
					{top.map((product) => (
						<li key={product.productId}>
							<Link
								className="active:bg-muted flex items-center gap-3 px-4 py-2"
								params={{ id: String(product.productId) }}
								to="/products/$id"
							>
								<img
									alt=""
									className="size-10 object-contain"
									src={product.imageUrl ?? undefined}
								/>
								<p className="min-w-0 flex-1 truncate text-sm">{product.name}</p>
								<span className="text-sm font-semibold tabular-nums">×{product.totalSold}</span>
								<span className="text-muted-foreground w-16 text-right text-xs tabular-nums">
									{short(Number(product.revenue))}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="px-2 py-2">
			<p className="text-base font-semibold tabular-nums">{value}</p>
			<p className="text-muted-foreground text-xs">{label}</p>
		</div>
	);
}

function Delta({ base, value }: { base: number; value: number }) {
	if (base === 0) {
		return null;
	}
	const change = Math.round(((value - base) / base) * 100);
	return (
		<span
			className={cn(
				"mb-0.5 text-sm font-semibold tabular-nums",
				change >= 0 ? "text-emerald-700" : "text-red-700",
			)}
		>
			{change >= 0 ? "↑" : "↓"}
			{Math.abs(change)}%
		</span>
	);
}

function Period({
	base,
	label,
	note,
	value,
}: {
	base: Day;
	label: string;
	note: string;
	value: Day;
}) {
	return (
		<div className="px-4 py-3">
			<p className="text-muted-foreground text-xs">{label}</p>
			<div className="flex items-baseline gap-2">
				<p className="text-lg font-bold tabular-nums">{short(value.revenue)}</p>
				<Delta base={base.revenue} value={value.revenue} />
			</div>
			<p className="text-muted-foreground text-xs">
				{value.orders} захиалга · {note}
			</p>
		</div>
	);
}

function StockFixer() {
	const [term, setTerm] = useState("");
	const results = useQuery({
		...trpc.product.searchProductByName.queryOptions({ searchTerm: term.trim() }),
		enabled: term.trim().length >= 2,
	});

	return (
		<section className="border bg-white">
			<h2 className="text-muted-foreground px-4 pt-3 text-xs font-medium tracking-wide uppercase">
				Үлдэгдэл засах
			</h2>
			<div className="relative px-4 py-2">
				<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-1/2" />
				<input
					className="focus:border-foreground border-input h-11 w-full border pl-9 text-[15px] outline-none"
					onChange={(e) => setTerm(e.target.value)}
					placeholder="Барааны нэрээр хайх"
					type="search"
					value={term}
				/>
			</div>
			{results.data?.length ? (
				<ul className="divide-y border-t">
					{results.data.map((product) => (
						<li className="flex gap-3 px-4 py-3" key={product.id}>
							<img
								alt=""
								className="size-16 shrink-0 border object-contain p-1"
								src={product.images[0]?.url}
							/>
							<div className="min-w-0 flex-1 space-y-2">
								<Link
									className="line-clamp-2 text-sm leading-snug"
									params={{ id: String(product.id) }}
									to="/products/$id"
								>
									{product.name}
								</Link>
								<StockStepper key={product.stock} productId={product.id} stock={product.stock} />
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="text-muted-foreground px-4 pb-3 text-xs">
					{term.trim().length >= 2 && !results.isFetching
						? "Олдсонгүй"
						: "Тоолсон бараагаа хайгаад тоог нь засна"}
				</p>
			)}
		</section>
	);
}
