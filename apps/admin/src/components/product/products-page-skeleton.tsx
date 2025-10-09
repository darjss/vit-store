import { Skeleton } from "@/components/ui/skeleton";

const ProductsPageSkeleton = () => {
	return (
		<div className="space-y-3">
			{/* Search Bar */}
			<div className="relative">
				<Skeleton className="absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 rounded-base border-2 border-border" />
				<Skeleton className="h-12 w-full rounded-base border-2 border-border bg-background pr-14 pl-14 shadow-shadow" />
				<Skeleton className="absolute right-1 top-1/2 h-10 w-12 -translate-y-1/2 rounded-base border-2 border-border" />
			</div>

			{/* Filters */}
			<div className="flex w-full flex-row gap-2">
				<Skeleton className="h-10 w-full min-w-[140px] rounded-base border-2 border-border bg-secondary-background sm:w-[160px]" />
				<Skeleton className="h-10 w-full min-w-[120px] rounded-base border-2 border-border bg-secondary-background sm:w-[160px]" />
			</div>

			{/* Sort and Add buttons */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-wrap gap-2">
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border bg-secondary-background" />
					<Skeleton className="h-10 w-24 rounded-base border-2 border-border bg-secondary-background" />
					<Skeleton className="h-10 w-20 rounded-base border-2 border-border bg-secondary-background" />
					<Skeleton className="h-10 w-20 rounded-base border-2 border-border bg-secondary-background" />
				</div>
				<Skeleton className="h-10 w-40 rounded-base border-2 border-border bg-secondary-background" />
			</div>

			{/* Product Cards Grid */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div
						key={index}
						className="overflow-hidden rounded-base border-2 border-border bg-card shadow-none transition-all hover:shadow-none"
					>
						<div className="flex flex-row">
							{/* Product Image */}
							<div className="flex h-20 w-20 shrink-0 items-center justify-center border-border border-r-2 bg-background p-2">
								<div className="h-full w-full overflow-hidden rounded-base border-2 border-border bg-background p-2">
									<Skeleton className="h-full w-full rounded-base border-2 border-border" />
								</div>
							</div>

							{/* Product Info */}
							<div className="flex flex-1 flex-col p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-2">
										<Skeleton className="h-5 w-3/4 rounded-base border-2 border-border" />
										<div className="flex items-center gap-2">
											<Skeleton className="h-4 w-16 rounded-base border-2 border-border" />
											<Skeleton className="h-4 w-1 rounded-base border-2 border-border" />
											<Skeleton className="h-4 w-20 rounded-base border-2 border-border" />
										</div>
									</div>
									<Skeleton className="h-6 w-20 rounded-full border-2 border-border" />
								</div>

								<div className="mt-1 flex items-center gap-3">
									<Skeleton className="h-6 w-16 rounded-base border-2 border-border" />
									<div className="flex items-center gap-1">
										<Skeleton className="h-4 w-4 rounded-base border-2 border-border" />
										<Skeleton className="h-4 w-8 rounded-base border-2 border-border" />
										<Skeleton className="h-3 w-12 rounded-base border-2 border-border" />
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
					</div>
				))}
			</div>

			{/* Pagination */}
			<div className="mt-4">
				<div className="flex items-center justify-center gap-2">
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border bg-primary" />
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
					<Skeleton className="h-10 w-10 rounded-base border-2 border-border" />
				</div>
			</div>
		</div>
	);
};

export default ProductsPageSkeleton;
