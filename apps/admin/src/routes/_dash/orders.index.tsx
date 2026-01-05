import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	orderStatus as orderStatusConstants,
	PRODUCT_PER_PAGE,
	paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import {
	Calendar as CalendarIcon,
	ChevronDown,
	ChevronUp,
	PlusCircle,
	RotateCcw,
	Search,
	X,
} from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";
import { DataPagination } from "@/components/data-pagination";
import OrderCard from "@/components/order/order-card";
import SubmitButton from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	loader: async ({ context: ctx, location }) => {
		const search = location.search as {
			page?: number;
			pageSize?: number;
			searchTerm?: string;
			sortField?: string;
			sortDirection?: "asc" | "desc";
			orderStatus?: string;
			paymentStatus?: string;
			date?: string;
		};
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.order.getPaginatedOrders.queryOptions({
				page: search.page ?? 1,
				pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
				searchTerm: search.searchTerm,
				sortField: search.sortField,
				sortDirection: search.sortDirection,
				orderStatus: search.orderStatus as
					| (typeof orderStatusConstants)[number]
					| undefined,
				paymentStatus: search.paymentStatus as
					| (typeof paymentStatusConstants)[number]
					| undefined,
				date: search.date,
			}),
		);
	},
	validateSearch: v.object({
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(
			v.pipe(v.number(), v.integer(), v.minValue(1)),
			PRODUCT_PER_PAGE,
		),
		searchTerm: v.optional(v.string()),
		sortField: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
		orderStatus: v.optional(v.picklist(orderStatusConstants)),
		paymentStatus: v.optional(v.picklist(paymentStatusConstants)),
		date: v.optional(v.string()),
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
		date,
	} = useSearch({ from: "/_dash/orders/" });
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const [isDateOpen, setIsDateOpen] = useState(false);
	const hasActiveFilters =
		orderStatus !== undefined ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
	const navigate = useNavigate({ from: Route.fullPath });
	const mutation = useMutation({
		...trpc.order.searchOrder.mutationOptions(),
		onSuccess: (data) => {
			console.log("data", data);
		},
	});
	const filtersActive = hasActiveFilters || sortField !== "";

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
	const handleResetFilters = () => {
		console.log("reset filters");
		navigate({
			to: "/orders",
			search: (_prev) => ({
				orderStatus: undefined,
				paymentStatus: undefined,
				sortField: undefined,
				sortDirection: "asc",
				searchTerm: undefined,
				date: undefined,
				page: 1,
			}),
		});
	};
	const handleSort = (field: string) => {
		console.log("sort", field);
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
	const handleDateSelect = (selectedDate: Date | undefined) => {
		if (selectedDate) {
			const dateStr = selectedDate.toISOString().split("T")[0];
			navigate({
				to: "/orders",
				search: (prev) => ({
					...prev,
					date: dateStr,
					page: 1,
				}),
			});
		} else {
			navigate({
				to: "/orders",
				search: (prev) => ({
					...prev,
					date: undefined,
					page: 1,
				}),
			});
		}
		setIsDateOpen(false);
	};
	const formatDateDisplay = () => {
		if (!date) return "Өнөөдөр";
		const d = new Date(`${date}T00:00:00+08:00`);
		return d.toLocaleDateString("mn-MN", {
			month: "short",
			day: "numeric",
		});
	};
	const selectedDate = date ? new Date(`${date}T00:00:00+08:00`) : undefined;

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
							className="h-9 w-fit gap-1"
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
							<Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
								<PopoverTrigger asChild>
									<button
										type="button"
										className={`inline-flex h-9 min-w-[100px] max-w-[120px] items-center justify-center gap-1 whitespace-nowrap rounded-md border px-3 py-2 font-medium text-xs ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
											date
												? "bg-primary text-primary-foreground hover:bg-primary/90"
												: "border-input bg-background hover:bg-accent hover:text-accent-foreground"
										}`}
									>
										<CalendarIcon className="h-4 w-4" />
										<span className="truncate">{formatDateDisplay()}</span>
									</button>
								</PopoverTrigger>
								<PopoverContent className="w-auto p-0" align="start">
									<Calendar
										mode="single"
										selected={selectedDate}
										onSelect={handleDateSelect}
										disabled={(date) =>
											date > new Date() ||
											date < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
										}
										components={{
											DayButton: CalendarDayButton,
										}}
									/>
									{date && (
										<div className="border-t p-2">
											<Button
												variant="ghost"
												size="sm"
												className="w-full"
												onClick={() => handleDateSelect(undefined)}
											>
												Өнөөдөр
											</Button>
										</div>
									)}
								</PopoverContent>
							</Popover>
							<Select
								value={orderStatus ?? "all"}
								onValueChange={(value) =>
									handleFilterChange("orderStatus", value)
								}
							>
								<SelectTrigger className="h-9 min-w-[100px] max-w-[140px]">
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
								<SelectTrigger className="h-9 min-w-[100px] max-w-[140px]">
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
							{(filtersActive || sortField !== "" || date) && (
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

				<Suspense
					fallback={
						<div className="grid grid-cols-1 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: 6 }).map((_, index) => (
								<Skeleton
									key={index}
									className="h-48 rounded-lg border-2 border-border"
								/>
							))}
						</div>
					}
				>
					<OrdersList
						page={page}
						pageSize={pageSize}
						searchTerm={searchTerm}
						sortField={sortField}
						sortDirection={sortDirection}
						orderStatus={orderStatus}
						paymentStatus={paymentStatus}
						date={date}
					/>
				</Suspense>
			</CardContent>
		</Card>
	);
}

function OrdersList({
	page,
	pageSize,
	searchTerm,
	sortField,
	sortDirection,
	orderStatus,
	paymentStatus,
	date,
}: {
	page: number;
	pageSize: number;
	searchTerm?: string;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	orderStatus?: string;
	paymentStatus?: string;
	date?: string;
}) {
	const navigate = useNavigate({ from: Route.fullPath });
	const { data: ordersData } = useSuspenseQuery({
		...trpc.order.getPaginatedOrders.queryOptions({
			page,
			paymentStatus: paymentStatus as
				| (typeof paymentStatusConstants)[number]
				| undefined,
			pageSize,
			sortField,
			sortDirection,
			orderStatus: orderStatus as
				| (typeof orderStatusConstants)[number]
				| undefined,
			searchTerm,
			date,
		}),
	});
	const orders = ordersData.orders;
	const pagination = ordersData.pagination;

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
		<>
			<div className="grid grid-cols-1 gap-2 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
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
		</>
	);
}
