import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as v from "valibot";
import CustomerCard from "@/components/customers/customer-card";
import CustomerForm from "@/components/customers/customer-form";
import { DataPagination } from "@/components/data-pagination";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { CustomersPageSkeleton } from "@/components/skeletons/admin-page-skeletons";

export const Route = createFileRoute("/_dash/customers")({
	component: RouteComponent,
	loader: ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(ctx.trpc.customer.getAllCustomers.queryOptions());
	},
	pendingComponent: CustomersPageSkeleton,
	validateSearch: v.object({
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 10),
		searchTerm: v.optional(v.string()),
	}),
});

function RouteComponent() {
	const { page, pageSize, searchTerm } = useSearch({
		from: "/_dash/customers",
	});
	const navigate = useNavigate({ from: Route.fullPath });
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const optimisticSearchTerm = inputValue.trim() || undefined;
	const currentSearchTerm = searchTerm?.trim() || undefined;
	const optimisticPage = optimisticSearchTerm !== currentSearchTerm ? 1 : page;

	useEffect(() => {
		setInputValue(searchTerm || "");
	}, [searchTerm]);

	useEffect(() => {
		if (optimisticSearchTerm === currentSearchTerm) {
			return;
		}

		const timeout = window.setTimeout(() => {
			navigate({
				replace: true,
				search: {
					page: 1,
					pageSize,
					searchTerm: optimisticSearchTerm,
				},
				to: "/customers",
			});
		}, 250);

		return () => window.clearTimeout(timeout);
	}, [currentSearchTerm, navigate, optimisticSearchTerm, pageSize]);

	const handleSearch = () => {
		navigate({
			search: {
				page: 1,
				pageSize,
				searchTerm: optimisticSearchTerm,
			},
			to: "/customers",
		});
	};

	const handleClearSearch = () => {
		setInputValue("");
		navigate({
			search: {
				page: 1,
				pageSize,
				searchTerm: undefined,
			},
			to: "/customers",
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Dialog>
					<DialogTrigger asChild>
						<Button className="gap-2">
							<Plus className="h-4 w-4" />
							<span className="hidden sm:inline">Хэрэглэгч нэмэх</span>
							<span className="sm:hidden">Нэмэх</span>
						</Button>
					</DialogTrigger>
					<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-md">
						<DialogHeader className="border-b px-6 pt-6 pb-4">
							<DialogTitle>Хэрэглэгч нэмэх</DialogTitle>
							<DialogDescription>Шинэ хэрэглэгч бүртгэх.</DialogDescription>
						</DialogHeader>
						<div className="max-h-[80vh] overflow-y-auto p-6">
							<CustomerForm
								onSuccess={() =>
									navigate({
										search: {
											page: 1,
											pageSize: 10,
										},
										to: "/customers",
									})
								}
							/>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative">
				<Search className="text-muted-foreground absolute top-1/2 left-4 h-6 w-6 -translate-y-1/2" />
				<Input
					className="rounded-base border-border bg-background shadow-shadow h-12 w-full border-2 pr-14 pl-14"
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					placeholder="Хэрэглэгч хайх (утас, хаяг)..."
					value={inputValue}
				/>
				{inputValue && (
					<Button
						aria-label="Хайлт цэвэрлэх"
						className="rounded-base border-border hover:bg-muted absolute top-1/2 right-14 h-8 w-8 -translate-y-1/2 border-2"
						onClick={handleClearSearch}
						size="icon"
						variant="secondary"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
				<Button
					aria-label="Хайх"
					className="rounded-base border-border shadow-shadow absolute top-1/2 right-1 h-10 w-12 -translate-y-1/2 border-2 transition-shadow hover:shadow-md"
					disabled={!inputValue.trim()}
					onClick={handleSearch}
				>
					<Search className="h-5 w-5" />
				</Button>
			</div>

			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{Array.from({ length: 8 }).map((_, index) => (
							<Skeleton className="rounded-base border-border h-32 border-2" key={index} />
						))}
					</div>
				}
			>
				<CustomersList
					page={optimisticPage}
					pageSize={pageSize}
					searchTerm={optimisticSearchTerm}
				/>
			</Suspense>
		</div>
	);
}

function CustomersList({
	page,
	pageSize,
	searchTerm,
}: {
	page: number;
	pageSize: number;
	searchTerm?: string;
}) {
	const { data: customers, isFetching } = useSuspenseQuery({
		...trpc.customer.getAllCustomers.queryOptions(),
		staleTime: 30_000,
	});

	const filtered = useMemo(() => {
		if (!searchTerm) {
			return customers;
		}
		const term = searchTerm.toLowerCase().trim();
		return customers.filter((c) => {
			const phone = String(c.phone);
			const address = c.address ?? "";
			return phone.includes(term) || address.toLowerCase().includes(term);
		});
	}, [customers, searchTerm]);

	const totalCount = filtered.length;
	const startIndex = Math.max(0, (page - 1) * pageSize);
	const paginated = filtered.slice(startIndex, startIndex + pageSize);
	const navigate = useNavigate({ from: Route.fullPath });

	const handlePageChange = (newPage: number) => {
		navigate({
			search: {
				page: newPage,
				pageSize,
				searchTerm,
			},
			to: "/customers",
		});
	};

	if (paginated.length === 0) {
		return (
			<>
				<div className="rounded-base border-border text-muted-foreground border-2 p-8 text-center">
					{searchTerm ? `"${searchTerm}" олдсонгүй` : "Хэрэглэгч олдсонгүй."}
				</div>
				<div>
					<DataPagination
						currentPage={page}
						isLoading={isFetching}
						itemsPerPage={pageSize}
						onPageChange={handlePageChange}
						totalItems={totalCount}
					/>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{paginated.map((c) => (
					<CustomerCard customer={c} key={c.phone} />
				))}
			</div>
			<div>
				<DataPagination
					currentPage={page}
					isLoading={isFetching}
					itemsPerPage={pageSize}
					onPageChange={handlePageChange}
					totalItems={totalCount}
				/>
			</div>
		</>
	);
}
