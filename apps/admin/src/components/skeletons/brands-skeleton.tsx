import { Skeleton } from "@/components/ui/skeleton";

export function BrandsSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Skeleton className="h-10 w-32 rounded-base border-2 border-border" />
			</div>
			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
				{Array.from({ length: 12 }).map((_, index) => (
					<Skeleton
						key={index}
						className="aspect-square rounded-base border-2 border-border"
					/>
				))}
			</div>
		</div>
	);
}

