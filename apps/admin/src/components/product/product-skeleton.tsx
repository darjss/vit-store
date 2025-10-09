import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ProductSkeleton = () => {
	return (
		<Card className="overflow-hidden border-2 border-border bg-card shadow-none transition-all hover:shadow-none">
			<CardContent className="p-0">
				<div className="flex flex-row">
					<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
						<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
							<Skeleton className="h-full w-full border-2 border-border" />
						</div>
					</div>

					<div className="flex flex-1 flex-col p-3">
						<div className="flex items-start justify-between gap-3">
							<div className="min-w-0 flex-1 space-y-2">
								<Skeleton className="h-5 w-3/4 border-2 border-border" />
								<div className="flex items-center gap-2">
									<Skeleton className="h-4 w-16 border-2 border-border" />
									<Skeleton className="h-4 w-1 border-2 border-border" />
									<Skeleton className="h-4 w-20 border-2 border-border" />
								</div>
							</div>
							<Skeleton className="h-6 w-20 rounded-full border-2 border-border" />
						</div>

						<div className="mt-1 flex items-center gap-3">
							<Skeleton className="h-6 w-16 border-2 border-border" />
							<div className="flex items-center gap-1">
								<Skeleton className="h-4 w-4 border-2 border-border" />
								<Skeleton className="h-4 w-8 border-2 border-border" />
								<Skeleton className="h-3 w-12 border-2 border-border" />
							</div>
						</div>

						<div className="mt-2 flex items-center justify-between gap-2">
							<div className="flex gap-2">
								<Skeleton className="h-8 w-24 rounded-base border-2 border-border" />
								<Skeleton className="h-8 w-8 rounded-base border-2 border-border" />
								<Skeleton className="h-8 w-8 rounded-base border-2 border-border" />
							</div>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
};

export default ProductSkeleton;
