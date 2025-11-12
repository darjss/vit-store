import { Skeleton } from "@/components/ui/skeleton";

export function AnalyticsSkeleton() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			<Skeleton className="h-8 w-48 rounded-base border-2 border-border" />
			<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
			</div>
			<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
				<Skeleton className="h-80 w-full rounded-base border-2 border-border" />
			</div>
		</div>
	);
}

