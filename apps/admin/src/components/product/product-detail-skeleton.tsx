import { Skeleton } from "@/components/ui/skeleton";

const ProductDetailSkeleton = () => {
	return (
		<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
			<div className="mx-auto w-full max-w-none">
				{/* Header */}
				<div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<Skeleton className="h-10 w-10 rounded-lg border-2 border-border" />
						<div>
							<Skeleton className="h-8 w-48 border-2 border-border" />
							<Skeleton className="mt-1 h-4 w-32 border-2 border-border" />
						</div>
					</div>
					<div className="flex items-center gap-3">
						<Skeleton className="h-8 w-24 rounded-full border-2 border-border" />
						<Skeleton className="h-10 w-20 rounded-lg border-2 border-border" />
					</div>
				</div>

				<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
					{/* Left Column */}
					<div className="space-y-6">
						{/* Main Info Card */}
						<div className="border-2 border-border bg-card p-6 shadow-shadow">
							<div className="mb-6 flex items-center gap-2">
								<Skeleton className="h-5 w-5 border-2 border-border" />
								<Skeleton className="h-6 w-32 border-2 border-border" />
							</div>

							<div className="space-y-6">
								<Skeleton className="h-10 w-full border-2 border-border" />

								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
									<div className="space-y-2">
										<Skeleton className="h-4 w-16 border-2 border-border" />
										<Skeleton className="h-5 w-24 border-2 border-border" />
									</div>
									<div className="space-y-2">
										<Skeleton className="h-4 w-12 border-2 border-border" />
										<Skeleton className="h-5 w-20 border-2 border-border" />
									</div>
								</div>

								<Skeleton className="h-20 w-full border-2 border-border" />
								<Skeleton className="h-10 w-full border-2 border-border" />
								<Skeleton className="h-10 w-full border-2 border-border" />
							</div>
						</div>

						{/* Additional Info Card */}
						<div className="border-2 border-border bg-card p-6 shadow-shadow">
							<Skeleton className="mb-4 h-6 w-32 border-2 border-border" />
							<div className="space-y-6">
								<Skeleton className="h-10 w-full border-2 border-border" />
								<Skeleton className="h-10 w-full border-2 border-border" />
								<Skeleton className="h-10 w-full border-2 border-border" />
								<Skeleton className="h-10 w-full border-2 border-border" />
							</div>
						</div>
					</div>

					{/* Right Column */}
					<div className="space-y-6">
						{/* Images Card */}
						<div className="border-2 border-border bg-card p-6 shadow-shadow">
							<div className="mb-4 flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Skeleton className="h-5 w-5 border-2 border-border" />
									<Skeleton className="h-6 w-24 border-2 border-border" />
								</div>
								<Skeleton className="h-10 w-20 rounded-lg border-2 border-border" />
							</div>

							<div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
								{Array.from({ length: 8 }).map((_, index) => (
									<Skeleton
										key={index}
										className="aspect-square rounded-lg border-2 border-border"
									/>
								))}
							</div>
						</div>

						{/* Analytics Card */}
						<div className="border-2 border-border bg-card p-4 shadow-shadow sm:p-6 lg:p-8">
							<div className="mb-4 flex items-center gap-2">
								<Skeleton className="h-5 w-5 border-2 border-border" />
								<Skeleton className="h-6 w-20 border-2 border-border" />
							</div>

							<div className="space-y-3 sm:space-y-4 lg:space-y-6">
								<div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-2">
									{Array.from({ length: 4 }).map((_, index) => (
										<div
											key={index}
											className="rounded-lg border bg-muted/20 p-2"
										>
											<div className="flex items-center gap-1">
												<Skeleton className="h-3 w-3 border-2 border-border" />
												<Skeleton className="h-3 w-12 border-2 border-border" />
											</div>
											<Skeleton className="mt-1 h-4 w-8 border-2 border-border" />
										</div>
									))}
								</div>

								<div>
									<Skeleton className="mb-2 h-3 w-40 border-2 border-border" />
									<Skeleton className="h-20 w-full border-2 border-border sm:h-24" />
								</div>
							</div>
						</div>

						{/* Recent Orders Card */}
						<div className="border-2 border-border bg-card p-4 shadow-shadow sm:p-6 lg:p-8">
							<div className="mb-3 flex items-center gap-2">
								<Skeleton className="h-4 w-4 border-2 border-border" />
								<Skeleton className="h-6 w-32 border-2 border-border" />
							</div>

							<div className="space-y-2 sm:space-y-3">
								{Array.from({ length: 3 }).map((_, index) => (
									<div
										key={index}
										className="rounded-lg border-l-4 border-l-muted bg-muted/10 p-2 sm:p-3"
									>
										<div className="mb-1 flex items-center justify-between">
											<div className="flex items-center gap-1">
												<Skeleton className="h-3 w-3 border-2 border-border" />
												<Skeleton className="h-4 w-24 border-2 border-border" />
											</div>
											<Skeleton className="h-5 w-20 rounded-full border-2 border-border" />
										</div>
										<div className="flex items-center gap-2">
											<Skeleton className="h-3 w-3 border-2 border-border" />
											<Skeleton className="h-3 w-32 border-2 border-border" />
											<Skeleton className="h-3 w-1 border-2 border-border" />
											<Skeleton className="h-3 w-16 border-2 border-border" />
										</div>
										<div className="mt-1 flex items-center justify-between">
											<Skeleton className="h-3 w-8 border-2 border-border" />
											<Skeleton className="h-4 w-16 border-2 border-border" />
										</div>
									</div>
								))}
							</div>

							<div className="mt-3 border-t pt-3">
								<Skeleton className="h-9 w-full border-2 border-border" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProductDetailSkeleton;
