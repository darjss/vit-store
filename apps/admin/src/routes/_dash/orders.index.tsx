import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
	orderStatus as orderStatusConstants,
	PRODUCT_PER_PAGE,
	paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import { PlusCircle, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";
import SubmitButton from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { OrdersPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import OrdersFilters from "@/components/order/orders-filters";
import OrdersList from "@/components/order/orders-list";

const orderStatusFilterValues = [...orderStatusConstants, "active", "all"] as const;
const activeOrderStatuses = ["created", "pending", "shipped"] as const;

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	loader: ({ context: ctx, location }) => {
		const search = location.search as {
			date?: string;
			orderStatus?: string;
			page?: number;
			pageSize?: number;
			paymentStatus?: string;
			searchTerm?: string;
			sortDirection?: "asc" | "desc";
			sortField?: string;
		};
		const requestedOrderStatus = search.orderStatus ?? "active";
		const requestedDate = search.date ?? "all";
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.order.getPaginatedOrders.queryOptions({
				date: requestedDate,
				includeAllStatuses: requestedOrderStatus === "all",
				orderStatus:
					requestedOrderStatus === "all" || requestedOrderStatus === "active"
						? undefined
						: (requestedOrderStatus as (typeof orderStatusConstants)[number]),
				orderStatuses: requestedOrderStatus === "active" ? [...activeOrderStatuses] : undefined,
				page: search.page ?? 1,
				pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
				paymentStatus: search.paymentStatus as (typeof paymentStatusConstants)[number] | undefined,
				searchTerm: search.searchTerm,
				sortDirection: search.sortDirection,
				sortField: search.sortField,
			}),
		);
	},
	pendingComponent: OrdersPageSkeleton,
	validateSearch: v.object({
		date: v.optional(v.string(), "all"),
		orderStatus: v.optional(v.picklist(orderStatusFilterValues), "active"),
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
		paymentStatus: v.optional(v.picklist(paymentStatusConstants)),
		searchTerm: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
		sortField: v.optional(v.string()),
	}),
});

function RouteComponent() {
	const { date, orderStatus, page, pageSize, paymentStatus, searchTerm, sortDirection, sortField } =
		useSearch({ from: "/_dash/orders/" });

	const effectivePaymentStatus = paymentStatus;
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const [filtersOpen, setFiltersOpen] = useState(false);

	const hasActiveFilters =
		orderStatus !== "active" ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined ||
		date !== "all";

	const navigate = useNavigate({ from: Route.fullPath });

	const handleSearch = () => {
		navigate({
			search: {
				date,
				orderStatus,
				page: 1,
				pageSize,
				paymentStatus,
				searchTerm: inputValue || undefined,
				sortDirection,
				sortField,
			},
			to: "/orders",
		});
	};

	const clearSearch = () => {
		setInputValue("");
		navigate({
			search: {
				date,
				orderStatus,
				page: 1,
				pageSize,
				paymentStatus,
				searchTerm: undefined,
				sortDirection,
				sortField,
			},
			to: "/orders",
		});
	};

	const handleFilterChange = (field: string, value: string) => {
		const normalized = value === "all" ? undefined : value;
		navigate({
			search: {
				date,
				orderStatus: field === "orderStatus" ? value : orderStatus,
				page: 1,
				pageSize,
				paymentStatus: field === "paymentStatus" ? normalized : paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
			},
			to: "/orders",
		});
	};

	const handleResetFilters = () => {
		setInputValue("");
		navigate({
			search: {
				date: "all",
				orderStatus: "active",
				page: 1,
				paymentStatus: undefined,
				searchTerm: undefined,
				sortDirection: "asc",
				sortField: undefined,
			},
			to: "/orders",
		});
	};

	const handleSort = (field: string) => {
		const newDirection = sortField === field && sortDirection === "asc" ? "desc" : "asc";
		navigate({
			search: {
				date,
				orderStatus,
				page,
				pageSize,
				paymentStatus,
				searchTerm,
				sortDirection: newDirection,
				sortField: field,
			},
			to: "/orders",
		});
	};

	return (
		<div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
			{/* Header */}
			<div className="flex items-center justify-between gap-4">
				<div>
					<h1 className="font-heading text-2xl font-black tracking-tight sm:text-3xl">
						Захиалгууд
					</h1>
					<p className="text-muted-foreground mt-0.5 text-sm">
						Захиалгыг удирдах, илгээх, хүргэлтийн мэдээлэл оруулах
					</p>
				</div>
				<Button asChild className="shadow-hard h-11 gap-2">
					<Link to="/orders/add">
						<PlusCircle className="h-4 w-4" />
						<span className="hidden sm:inline">Захиалга нэмэх</span>
						<span className="sm:hidden">Нэмэх</span>
					</Link>
				</Button>
			</div>

			{/* Search */}
			<div className="relative">
				<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
				<Input
					className="border-border bg-card shadow-hard-sm h-12 border-2 pr-24 pl-10 text-base"
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					placeholder="Захиалгын дугаар, утас хайх..."
					value={inputValue}
				/>
				<div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
					{inputValue && (
						<Button
							aria-label="Хайлтыг цэвэрлэх"
							className="h-8 w-8"
							onClick={clearSearch}
							size="icon"
							variant="ghost"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
					<SubmitButton aria-label="Хайх" className="h-9 px-3 text-xs" onClick={handleSearch}>
						<Search className="h-4 w-4" />
					</SubmitButton>
				</div>
			</div>

			{/* Filters */}
			<div className="space-y-3">
				<div className="flex items-center gap-2 sm:hidden">
					<Button
						className="h-10 gap-2"
						onClick={() => setFiltersOpen(!filtersOpen)}
						size="sm"
						variant={filtersOpen ? "default" : "outline"}
					>
						<SlidersHorizontal className="h-4 w-4" />
						Шүүлтүүр
						{hasActiveFilters && (
							<span className="bg-primary-foreground text-primary ml-1 flex h-5 w-5 items-center justify-center text-[10px] font-bold">
								!
							</span>
						)}
					</Button>
					{hasActiveFilters && (
						<Button className="h-10 gap-1.5" onClick={handleResetFilters} size="sm" variant="ghost">
							<RotateCcw className="h-3.5 w-3.5" />
							Цэвэрлэх
						</Button>
					)}
				</div>

				<div className={`space-y-3 ${filtersOpen ? "block" : "hidden sm:block"}`}>
					<OrdersFilters
						date={date}
						filtersActive={hasActiveFilters}
						onFilterChange={handleFilterChange}
						onResetFilters={handleResetFilters}
						onSort={handleSort}
						orderStatus={orderStatus}
						pageSize={pageSize}
						paymentStatus={paymentStatus}
						searchTerm={searchTerm}
						sortDirection={sortDirection}
						sortField={sortField}
					/>
				</div>
			</div>

			{/* Orders list */}
			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton className="border-border shadow-hard-sm h-56 border-2" key={i} />
						))}
					</div>
				}
			>
				<OrdersList
					date={date}
					orderStatus={orderStatus}
					page={page}
					pageSize={pageSize}
					paymentStatus={effectivePaymentStatus}
					searchTerm={searchTerm}
					sortDirection={sortDirection}
					sortField={sortField}
				/>
			</Suspense>
		</div>
	);
}
