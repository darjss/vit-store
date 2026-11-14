import { Skeleton } from "@/components/ui/skeleton";

const ProductsPageSkeleton = () => {
	return (
		<div className="space-y-3">
			{/* Search Bar */}
			<div className="relative">
				<Skeleton className="rounded-base border-border absolute top-1/2 left-4 h-6 w-6 -translate-y-1/2 border" />
				<Skeleton className="rounded-base border-border bg-background h-12 w-full border pr-14 pl-14" />
				<Skeleton className="rounded-base border-border absolute top-1/2 right-1 h-10 w-12 -translate-y-1/2 border" />
			</div>

			{/* Filters */}
			<div className="flex w-full flex-row gap-2">
				<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-full min-w-[140px] border sm:w-[160px]" />
				<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-full min-w-[120px] border sm:w-[160px]" />
			</div>

			{/* Sort and Add buttons */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex flex-wrap gap-2">
					<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-10 border" />
					<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-24 border" />
					<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-20 border" />
					<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-20 border" />
				</div>
				<Skeleton className="rounded-base border-border bg-secondary-background h-10 w-40 border" />
			</div>

			{/* Product Cards Grid */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				{Array.from({ length: 6 }).map((_, index) => (
					<div
						className="rounded-base border-border bg-card overflow-hidden border shadow-none transition-all"
						key={index}
					>
						<div className="flex flex-row">
							{/* Product Image */}
							<div className="border-border bg-background flex h-20 w-20 shrink-0 items-center justify-center border-r p-2">
								<div className="rounded-base border-border bg-background h-full w-full overflow-hidden border p-2">
									<Skeleton className="rounded-base border-border h-full w-full border" />
								</div>
							</div>

							{/* Product Info */}
							<div className="flex flex-1 flex-col p-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 flex-1 space-y-2">
										<Skeleton className="rounded-base border-border h-5 w-3/4 border" />
										<div className="flex items-center gap-2">
											<Skeleton className="rounded-base border-border h-4 w-16 border" />
											<Skeleton className="rounded-base border-border h-4 w-1 border" />
											<Skeleton className="rounded-base border-border h-4 w-20 border" />
										</div>
									</div>
									<Skeleton className="border-border h-6 w-20 rounded-full border" />
								</div>

								<div className="mt-1 flex items-center gap-3">
									<Skeleton className="rounded-base border-border h-6 w-16 border" />
									<div className="flex items-center gap-1">
										<Skeleton className="rounded-base border-border h-4 w-4 border" />
										<Skeleton className="rounded-base border-border h-4 w-8 border" />
										<Skeleton className="rounded-base border-border h-3 w-12 border" />
									</div>
								</div>

								<div className="mt-2 flex items-center justify-between gap-2">
									<div className="flex gap-2">
										<Skeleton className="rounded-base border-border h-8 w-24 border" />
										<Skeleton className="rounded-base border-border h-8 w-8 border" />
										<Skeleton className="rounded-base border-border h-8 w-8 border" />
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
					<Skeleton className="rounded-base border-border h-10 w-10 border" />
					<Skeleton className="rounded-base border-border h-10 w-10 border" />
					<Skeleton className="rounded-base border-border bg-primary h-10 w-10 border" />
					<Skeleton className="rounded-base border-border h-10 w-10 border" />
					<Skeleton className="rounded-base border-border h-10 w-10 border" />
				</div>
			</div>
		</div>
	);
};

export default ProductsPageSkeleton;
