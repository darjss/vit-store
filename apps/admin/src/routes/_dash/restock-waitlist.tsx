import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Package } from "lucide-react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/restock-waitlist")({
	component: RouteComponent,
	pendingComponent: RestockWaitlistSkeleton,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.listRestockWaitlist.queryOptions({ limit: 100 }),
		);
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<RestockWaitlistSkeleton />}>
			<RestockWaitlistPage />
		</Suspense>
	);
}

function RestockWaitlistSkeleton() {
	return (
		<div className="min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-5xl space-y-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-5 w-72" />
				<div className="space-y-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<Skeleton key={i} className="h-20 w-full" />
					))}
				</div>
			</div>
		</div>
	);
}

function RestockWaitlistPage() {
	const { data } = useSuspenseQuery(
		trpc.product.listRestockWaitlist.queryOptions({ limit: 100 }),
	);

	return (
		<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-5xl">
				<div className="mb-6 sm:mb-8">
					<div className="mb-2 flex items-center gap-2">
						<Bell className="h-5 w-5 text-primary" />
						<h1 className="font-heading text-xl sm:text-2xl md:text-3xl">
							Нөөц хүлээлт
						</h1>
					</div>
					<p className="text-muted-foreground text-sm">
						Хэрэглэгчид мэдэгдэл хүлээж буй бүтээгдэхүүнүүд — хүлээгчдийн
						тоогоор эрэмбэлсэн.
					</p>
				</div>

				{data.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-3 border-2 border-border bg-card p-10 text-center shadow-hard-sm">
						<Package className="h-10 w-10 text-muted-foreground" />
						<p className="font-heading text-base">Хүлээлт байхгүй</p>
						<p className="text-muted-foreground text-sm">
							Одоогоор нээлттэй restock subscription алга.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{data.map((row, index) => (
							<Link
								key={row.productId}
								to="/products/$id"
								params={{ id: String(row.productId) }}
								className="flex items-center gap-3 border-2 border-border bg-card p-3 shadow-hard-sm transition-colors hover:bg-muted/40 sm:gap-4 sm:p-4"
							>
								<div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-primary/15 font-heading text-sm">
									{index + 1}
								</div>
								{row.image ? (
									<img
										src={row.image}
										alt=""
										className="h-14 w-14 shrink-0 border-2 border-border object-contain"
									/>
								) : (
									<div className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-border bg-muted">
										<Package className="h-5 w-5 text-muted-foreground" />
									</div>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate font-heading text-sm sm:text-base">
										{row.name}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{row.brandName ? `${row.brandName} · ` : ""}
										нөөц {row.stock} · {row.status}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="font-bold font-heading text-lg tabular-nums">
										{row.waitCount}
									</p>
									<p className="text-muted-foreground text-xs">хүлээж буй</p>
								</div>
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
