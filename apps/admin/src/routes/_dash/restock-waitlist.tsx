import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Package } from "lucide-react";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/restock-waitlist")({
	component: RouteComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.product.listRestockWaitlist.queryOptions({ limit: 100 }),
		);
	},
	pendingComponent: RestockWaitlistSkeleton,
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
						<Skeleton className="h-20 w-full" key={i} />
					))}
				</div>
			</div>
		</div>
	);
}

function RestockWaitlistPage() {
	const { data } = useSuspenseQuery(trpc.product.listRestockWaitlist.queryOptions({ limit: 100 }));

	return (
		<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-5xl">
				<div className="mb-6 sm:mb-8">
					<div className="mb-2 flex items-center gap-2">
						<Bell className="text-primary h-5 w-5" />
						<h1 className="font-heading text-xl sm:text-2xl md:text-3xl">Нөөц хүлээлт</h1>
					</div>
					<p className="text-muted-foreground text-sm">
						Хэрэглэгчид мэдэгдэл хүлээж буй бүтээгдэхүүнүүд — хүлээгчдийн тоогоор эрэмбэлсэн.
					</p>
				</div>

				{data.length === 0 ? (
					<div className="border-border bg-card shadow-hard-sm flex flex-col items-center justify-center gap-3 border-2 p-10 text-center">
						<Package className="text-muted-foreground h-10 w-10" />
						<p className="font-heading text-base">Хүлээлт байхгүй</p>
						<p className="text-muted-foreground text-sm">
							Одоогоор нээлттэй restock subscription алга.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{data.map((row, index) => (
							<Link
								className="border-border bg-card shadow-hard-sm hover:bg-muted/40 flex items-center gap-3 border-2 p-3 transition-colors sm:gap-4 sm:p-4"
								key={row.productId}
								params={{ id: String(row.productId) }}
								to="/products/$id"
							>
								<div className="border-border bg-primary/15 font-heading flex h-10 w-10 shrink-0 items-center justify-center border-2 text-sm">
									{index + 1}
								</div>
								{row.image ? (
									<img
										alt=""
										className="border-border h-14 w-14 shrink-0 border-2 object-contain"
										src={row.image}
									/>
								) : (
									<div className="border-border bg-muted flex h-14 w-14 shrink-0 items-center justify-center border-2">
										<Package className="text-muted-foreground h-5 w-5" />
									</div>
								)}
								<div className="min-w-0 flex-1">
									<p className="font-heading truncate text-sm sm:text-base">{row.name}</p>
									<p className="text-muted-foreground truncate text-xs">
										{row.brandName ? `${row.brandName} · ` : ""}
										нөөц {row.stock} · {row.status}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="font-heading text-lg font-bold tabular-nums">{row.waitCount}</p>
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
