import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "@/components/ui/pagination";

export interface DataPaginationProps {
	currentPage: number;
	totalItems: number;
	itemsPerPage: number;
	onPageChange: (page: number) => void | Promise<void>;
	maxPageButtons?: number;
	showTotalCount?: boolean;
	className?: string;
	totalCountText?: string;
	isLoading?: boolean;
}

export function DataPagination({
	currentPage,
	totalItems,
	itemsPerPage,
	onPageChange,
	maxPageButtons = 2,
	showTotalCount = true,
	className = "",
	totalCountText,
	isLoading = false,
}: DataPaginationProps) {
	const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

	const handlePageChange = async (page: number) => {
		if (isLoading || page === currentPage || page < 1 || page > totalPages) {
			return;
		}
		await onPageChange(page);
	};

	const getPageNumbers = () => {
		const pageNumbers: number[] = [];
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
	const showEndEllipsis =
		totalPages > 1 && (pageNumbers[pageNumbers.length - 1] ?? 0) < totalPages;
	if (totalPages === 1) {
		return null;
	}
	return (
		<div className={`space-y-4 ${className}`}>
			{showTotalCount && (
				<p className="text-center text-muted-foreground text-xs">
					{totalCountText || `Page ${currentPage} of ${totalPages}`}
				</p>
			)}

			<Pagination className="justify-center">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							onClick={() => handlePageChange(currentPage - 1)}
							className={
								currentPage <= 1 || isLoading
									? "pointer-events-none opacity-50"
									: ""
							}
							aria-disabled={currentPage <= 1 || isLoading}
						/>
					</PaginationItem>

					{showStartEllipsis && (
						<>
							<PaginationItem>
								<PaginationLink
									onClick={() => handlePageChange(1)}
									isActive={currentPage === 1}
									aria-disabled={isLoading}
									className={isLoading ? "pointer-events-none" : ""}
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
								onClick={() => handlePageChange(pageNumber)}
								isActive={pageNumber === currentPage}
								aria-disabled={isLoading}
								className={isLoading ? "pointer-events-none" : ""}
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
									onClick={() => handlePageChange(totalPages)}
									isActive={currentPage === totalPages}
									aria-disabled={isLoading}
									className={isLoading ? "pointer-events-none" : ""}
								>
									{totalPages}
								</PaginationLink>
							</PaginationItem>
						</>
					)}

					<PaginationItem>
						<PaginationNext
							onClick={() => handlePageChange(currentPage + 1)}
							className={
								currentPage >= totalPages || isLoading
									? "pointer-events-none opacity-50"
									: ""
							}
							aria-disabled={currentPage >= totalPages || isLoading}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
}
