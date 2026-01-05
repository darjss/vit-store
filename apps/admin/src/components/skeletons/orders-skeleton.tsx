import { Skeleton } from "@/components/ui/skeleton";

export function OrdersSkeleton() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			<div className="space-y-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
					<Skeleton className="h-9 flex-1 rounded-lg border-2 border-border" />
					<Skeleton className="h-9 w-32 rounded-lg border-2 border-border" />
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
					<div className="flex gap-2">
						<Skeleton className="h-9 w-32 rounded-lg border-2 border-border" />
						<Skeleton className="h-9 w-32 rounded-lg border-2 border-border" />
					</div>
					<div className="flex items-center gap-2 sm:ml-auto">
						<Skeleton className="h-9 w-20 rounded-lg border-2 border-border" />
						<Skeleton className="h-9 w-20 rounded-lg border-2 border-border" />
					</div>
				</div>
			</div>
			<div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<Skeleton
						key={index}
						className="h-48 rounded-lg border-2 border-border"
					/>
				))}
			</div>
			<div className="mt-6 flex items-center justify-center gap-2">
				<Skeleton className="h-10 w-10 rounded-lg border-2 border-border" />
				<Skeleton className="h-10 w-10 rounded-lg border-2 border-border" />
				<Skeleton className="h-10 w-10 rounded-lg border-2 border-border" />
			</div>
		</div>
	);
}
