import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			{/* Pending Orders Banner */}
			<Skeleton className="h-20 w-full rounded-base border-2 border-border" />

			{/* Stats Grid */}
			<Skeleton className="h-48 w-full rounded-base border-2 border-border" />

			{/* Charts Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
			</div>

			{/* Bottom Grid */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
				<div className="flex flex-col gap-2">
					<Skeleton className="h-40 w-full rounded-base border-2 border-border" />
					<Skeleton className="h-40 w-full rounded-base border-2 border-border" />
				</div>
			</div>
		</div>
	);
}

