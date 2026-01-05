import { Skeleton } from "@/components/ui/skeleton";

export function CustomersSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Skeleton className="h-10 w-32 rounded-base border-2 border-border" />
			</div>
			<div className="relative">
				<Skeleton className="h-12 w-full rounded-base border-2 border-border" />
			</div>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<Skeleton
						key={index}
						className="h-32 rounded-base border-2 border-border"
					/>
				))}
			</div>
			<div className="flex items-center justify-center gap-2">
				<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
				<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
				<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
			</div>
		</div>
	);
}
