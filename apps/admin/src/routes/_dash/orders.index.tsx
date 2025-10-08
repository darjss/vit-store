import {
	useMutation,
	useSuspenseQueries,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	ChevronDown,
	ChevronUp,
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { DataPagination } from "@/components/data-pagination";
import OrderCard from "@/components/order/order-card";
import SubmitButton from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	orderStatus as orderStatusConstants,
	paymentStatus as paymentStatusConstants,
} from "@/lib/constants";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	loader: async ({ context: ctx }) => {
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.order.getPaginatedOrders.queryOptions({}),
		);
	},
	validateSearch: z.object({
		page: z.number().default(1),
		pageSize: z.number().default(10),
		searchTerm: z.string().optional(),
		sortField: z.string().optional(),
		sortDirection: z.enum(["asc", "desc"]).default("asc"),
		orderStatus: z.enum(orderStatusConstants).optional(),
		paymentStatus: z.enum(paymentStatusConstants).optional(),
	}),
});

function RouteComponent() {
	const {
		page,
		pageSize,
		searchTerm,
		sortField,
		sortDirection,
		orderStatus,
		paymentStatus,
	} = useSearch({ from: "/_dash/orders/" });
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const hasActiveFilters =
		orderStatus !== undefined ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
	const navigate = useNavigate({ from: Route.fullPath });
	const { data: ordersData, isPending: _isPending } = useSuspenseQuery({
		...trpc.order.getPaginatedOrders.queryOptions({
			page,
			paymentStatus,
			pageSize,
			sortField,
			sortDirection,
			orderStatus,
			searchTerm,
		}),
	});
	const mutation = useMutation({
		...trpc.order.searchOrder.mutationOptions(),
		onSuccess: (data) => {
			console.log("data", data);
		},
	});
	const orders = ordersData.orders;
	const pagination = ordersData.pagination;
	const handleSearch = () => {
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				searchTerm: inputValue,
			}),
		});
	};
	const clearSearch = () => {
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				searchTerm: undefined,
			}),
		});
	};
	const handleFilterChange = (field: string, value: string) => {
		console.log("filter change", field, value);
		const normalized = value === "all" ? undefined : value;
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				[field]: normalized,
				page: 1,
			}),
		});
	};
	const filtersActive = hasActiveFilters || sortField !== "";
	const handleResetFilters = () => {
		console.log("reset filters");
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				orderStatus: undefined,
				paymentStatus: undefined,
				sortField: undefined,
				sortDirection: "asc",
				searchTerm: undefined,
				page: 1,
			}),
		});
	};
	const handleSort = (field: string) => {
		console.log("sort", field);
		// If clicking the same field, toggle direction
		// If clicking a different field, reset to ascending
		const newDirection =
			sortField === field && sortDirection === "asc" ? "desc" : "asc";
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				sortField: field,
				sortDirection: newDirection,
			}),
		});
	};
	const handlePageChange = (page: number) => {
		console.log("page change", page);
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				page: page,
			}),
		});
	};

	return (
		<Card className="w-full bg-transparent">
			<CardContent className="space-y-6 p-2 sm:p-6">
				<div className="space-y-4">
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
						<div className="relative flex-1">
							<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Захиалгын дугаар эсвэл харилцагч хайх..."
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleSearch()}
								className="h-9 w-full rounded-lg bg-background pl-8"
								disabled={mutation.isPending}
							/>
							{inputValue && (
								<Button
									size="icon"
									className="-translate-y-1/2 absolute top-1/2 right-10 h-6 w-6"
									onClick={clearSearch}
									disabled={mutation.isPending}
									aria-label="Clear search"
								>
									<X className="h-4 w-4" />
								</Button>
							)}
							<SubmitButton
								onClick={handleSearch}
								className="-translate-y-1/2 absolute top-1/2 right-0 h-9 w-9 rounded-l-none p-0"
								isPending={mutation.isPending}
								aria-label="Search"
							>
								<Search className="h-4 w-4" />
							</SubmitButton>
						</div>
						<Button
							size="sm"
							className="h-9 gap-1"
							asChild
							disabled={mutation.isPending}
						>
							<Link to="/orders/add">
								<PlusCircle className="h-3.5 w-3.5" />
								<span className="whitespace-nowrap">Захиалга нэмэх</span>
							</Link>
						</Button>
					</div>

					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
						<div className="flex gap-2">
							<Select
								value={orderStatus ?? "all"}
								onValueChange={(value) =>
									handleFilterChange("orderStatus", value)
								}
							>
								<SelectTrigger className="h-9 w-full sm:w-[140px]">
									<SelectValue placeholder="All Statuses" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Бүх төлөв</SelectItem>
									{orderStatusConstants.map((status) => (
										<SelectItem key={status} value={status}>
											{status.charAt(0).toUpperCase() + status.slice(1)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={paymentStatus ?? "all"}
								onValueChange={(value) =>
									handleFilterChange("paymentStatus", value)
								}
							>
								<SelectTrigger className="h-9 w-full sm:w-[140px]">
									<SelectValue placeholder="All Payments" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">Бүх төлбөр</SelectItem>
									{paymentStatusConstants.map((status) => (
										<SelectItem key={status} value={status}>
											{status.charAt(0).toUpperCase() + status.slice(1)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex items-center gap-2 sm:ml-auto">
							{(filtersActive || sortField !== "") && (
								<Button
									variant="default"
									size="sm"
									onClick={handleResetFilters}
									className="h-9 px-3 text-xs"
								>
									<RotateCcw className="mr-1 h-3 w-3" />
									Шинэчлэх
								</Button>
							)}
							<Button
								variant={sortField === "total" ? "default" : "outline"}
								size="sm"
								onClick={() => handleSort("total")}
								className="h-9 px-3"
							>
								Нийт
								{sortField === "total" &&
									(sortDirection === "asc" ? (
										<ChevronUp className="ml-1 h-4 w-4" />
									) : (
										<ChevronDown className="ml-1 h-4 w-4" />
									))}
							</Button>
							<Button
								variant={sortField === "createdAt" ? "default" : "outline"}
								size="sm"
								onClick={() => handleSort("createdAt")}
								className="h-9 px-3"
							>
								Огноо
								{sortField === "createdAt" &&
									(sortDirection === "asc" ? (
										<ChevronUp className="ml-1 h-4 w-4" />
									) : (
										<ChevronDown className="ml-1 h-4 w-4" />
									))}
							</Button>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
					{orders.map((order) => (
						<div key={order.orderNumber} className="min-w-0">
							<OrderCard order={order} />
						</div>
					))}
				</div>

				<div className="mt-6">
					<DataPagination
						currentPage={pagination.currentPage}
						totalItems={pagination.totalCount}
						itemsPerPage={10}
						onPageChange={handlePageChange}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
