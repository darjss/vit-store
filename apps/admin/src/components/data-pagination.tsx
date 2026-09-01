import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

interface DataPaginationProps {
	className?: string;
	currentPage: number;
	isLoading?: boolean;
	itemsPerPage: number;
	maxPageButtons?: number;
	onPageChange: (page: number) => void | Promise<void>;
	showTotalCount?: boolean;
	totalCountText?: string;
	totalItems: number;
}

// ponytail: legacy admin pagination — extract page window later; complexity ceiling 22
// oxlint-disable-next-line complexity
export function DataPagination({
	className = "",
	currentPage,
	isLoading = false,
	itemsPerPage,
	maxPageButtons = 2,
	onPageChange,
	showTotalCount = true,
	totalCountText,
	totalItems,
}: DataPaginationProps) {
	const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

	const handlePageChange = async (page: number) => {
		if (isLoading || page === currentPage || page < 1 || page > totalPages) {
			return;
		}
		await onPageChange(page);
	};

	const getPageNumbers = () => {
		const pageNumbers: Array<number> = [];
		let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
		let endPage = startPage + maxPageButtons - 1;

		if (endPage > totalPages) {
			endPage = totalPages;
			startPage = Math.max(1, endPage - maxPageButtons + 1);
		}

		for (let i = startPage; i <= endPage; i++) {
			pageNumbers.push(i);
		}

		return pageNumbers;
	};

	const pageNumbers = getPageNumbers();
	if (pageNumbers[0] === undefined) {
		return null;
	}

	const showStartEllipsis = totalPages > 1 && pageNumbers[0] > 1;
	const showEndEllipsis = totalPages > 1 && (pageNumbers.at(-1) ?? 0) < totalPages;
	if (totalPages === 1) {
		return null;
	}
	return (
		<div className={`space-y-4 ${className}`}>
			{showTotalCount && (
				<p className="text-muted-foreground text-center text-xs">
					{totalCountText || `${totalPages} хуудаснаас ${currentPage}-р хуудас`}
				</p>
			)}

			<Pagination className="justify-center">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={currentPage <= 1 || isLoading}
							className={currentPage <= 1 || isLoading ? "pointer-events-none opacity-50" : ""}
							onClick={() => handlePageChange(currentPage - 1)}
						/>
					</PaginationItem>

					{showStartEllipsis && (
						<>
							<PaginationItem>
								<PaginationLink
									aria-disabled={isLoading}
									className={isLoading ? "pointer-events-none" : ""}
									isActive={currentPage === 1}
									onClick={() => handlePageChange(1)}
								>
									1
								</PaginationLink>
							</PaginationItem>

							<PaginationItem>
								<PaginationEllipsis />
							</PaginationItem>
						</>
					)}

					{pageNumbers.map((pageNumber) => (
						<PaginationItem key={pageNumber}>
							<PaginationLink
								aria-disabled={isLoading}
								className={isLoading ? "pointer-events-none" : ""}
								isActive={pageNumber === currentPage}
								onClick={() => handlePageChange(pageNumber)}
							>
								{pageNumber}
							</PaginationLink>
						</PaginationItem>
					))}

					{showEndEllipsis && (
						<>
							<PaginationItem>
								<PaginationEllipsis />
							</PaginationItem>

							<PaginationItem>
								<PaginationLink
									aria-disabled={isLoading}
									className={isLoading ? "pointer-events-none" : ""}
									isActive={currentPage === totalPages}
									onClick={() => handlePageChange(totalPages)}
								>
									{totalPages}
								</PaginationLink>
							</PaginationItem>
						</>
					)}

					<PaginationItem>
						<PaginationNext
							aria-disabled={currentPage >= totalPages || isLoading}
							className={
								currentPage >= totalPages || isLoading ? "pointer-events-none opacity-50" : ""
							}
							onClick={() => handlePageChange(currentPage + 1)}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}
