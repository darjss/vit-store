import { keepPreviousData, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
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

export const Route = createFileRoute("/_dash/customers")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.customer.getAllCustomers.queryOptions(),
		);
	},
	validateSearch: v.object({
		page: v.pipe(v.number(), v.integer(), v.minValue(1)),
		pageSize: v.pipe(v.number(), v.integer(), v.minValue(1)),
		searchTerm: v.optional(v.string()),
	}),
});

function RouteComponent() {
	const { page, pageSize, searchTerm } = useSearch({
		from: "/_dash/customers",
	});
	const navigate = useNavigate({ from: Route.fullPath });
	const [inputValue, setInputValue] = useState(searchTerm || "");

	const handleSearch = () => {
		navigate({
			to: "/customers",
			search: (prev) => ({
				...prev,
				page: 1,
				searchTerm: inputValue || undefined,
			}),
		});
	};

	const handleClearSearch = () => {
		setInputValue("");
		navigate({
			to: "/customers",
			search: (prev) => ({ ...prev, page: 1, searchTerm: undefined }),
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
										to: "/customers",
										search: {
											page: 1,
											pageSize: 10,
										},
									})
								}
							/>
						</div>
					</DialogContent>
				</Dialog>
			</div>

			<div className="relative">
				<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-6 w-6 text-muted-foreground" />
				<Input
					placeholder="Хэрэглэгч хайх (утас, хаяг)..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					className="h-12 w-full rounded-base border-2 border-border bg-background pr-14 pl-14 shadow-shadow"
				/>
				{inputValue && (
					<Button
						size="icon"
						variant="secondary"
						className="-translate-y-1/2 absolute top-1/2 right-14 h-8 w-8 rounded-base border-2 border-border hover:bg-muted"
						onClick={handleClearSearch}
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
				<Button
					onClick={handleSearch}
					className="-translate-y-1/2 absolute top-1/2 right-1 h-10 w-12 rounded-base border-2 border-border shadow-shadow transition-shadow hover:shadow-md"
					disabled={!inputValue.trim()}
					aria-label="Search"
				>
					<Search className="h-5 w-5" />
				</Button>
			</div>

			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{Array.from({ length: 8 }).map((_, index) => (
							<Skeleton
								key={index}
								className="h-32 rounded-base border-2 border-border"
							/>
						))}
					</div>
				}
			>
				<CustomersList
					page={page}
					pageSize={pageSize}
					searchTerm={searchTerm}
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
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});

	const filtered = useMemo(() => {
		if (!searchTerm) return customers;
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
			to: "/customers",
			search: (prev) => ({ ...prev, page: newPage }),
		});
	};

	if (paginated.length === 0) {
		return (
			<>
				<div className="rounded-base border-2 border-border p-8 text-center text-muted-foreground">
					{searchTerm ? `"${searchTerm}" олдсонгүй` : "Хэрэглэгч олдсонгүй."}
				</div>
				<div>
					<DataPagination
						currentPage={page}
						totalItems={totalCount}
						itemsPerPage={pageSize}
						onPageChange={handlePageChange}
						isLoading={isFetching}
					/>
				</div>
			</>
		);
	}

	return (
		<>
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{paginated.map((c) => (
					<CustomerCard key={c.phone} customer={c} />
				))}
			</div>
			<div>
				<DataPagination
					currentPage={page}
					totalItems={totalCount}
					itemsPerPage={pageSize}
					onPageChange={handlePageChange}
					isLoading={isFetching}
				/>
			</div>
		</>
	);
}
