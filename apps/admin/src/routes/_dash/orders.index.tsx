import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
	orderStatus as orderStatusConstants,
	PRODUCT_PER_PAGE,
	paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import { Plus, PlusCircle, Search, X } from "lucide-react";
import { Suspense, useState } from "react";
import {
	type InferOutput,
	integer,
	minValue,
	number,
	object,
	optional,
	parse,
	picklist,
	pipe,
	string,
} from "valibot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OrdersPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import OrdersFilters from "@/components/order/orders-filters";
import OrdersList from "@/components/order/orders-list";

const orderStatusFilterValues = [...orderStatusConstants, "active", "all"] as const;
const activeOrderStatuses = ["created", "pending", "shipped"] as const;

const ordersSearchSchema = object({
	date: optional(string(), "all"),
	orderStatus: optional(picklist(orderStatusFilterValues), "active"),
	page: optional(pipe(number(), integer(), minValue(1)), 1),
	pageSize: optional(pipe(number(), integer(), minValue(1)), PRODUCT_PER_PAGE),
	paymentStatus: optional(picklist(paymentStatusConstants)),
	searchTerm: optional(string()),
	sortDirection: optional(picklist(["asc", "desc"])),
	sortField: optional(string()),
});

function paginatedOrdersQueryFilters(search: InferOutput<typeof ordersSearchSchema>) {
	const requestedOrderStatus = search.orderStatus ?? "active";
	return {
		date: search.date ?? "all",
		includeAllStatuses: requestedOrderStatus === "all",
		orderStatus:
			requestedOrderStatus === "all" || requestedOrderStatus === "active"
				? undefined
				: requestedOrderStatus,
		orderStatuses: requestedOrderStatus === "active" ? [...activeOrderStatuses] : undefined,
		page: search.page ?? 1,
		pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
		paymentStatus: search.paymentStatus,
		searchTerm: search.searchTerm,
		sortDirection: search.sortDirection,
		sortField: search.sortField,
	};
}

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	loader: ({ context: ctx, location }) => {
		const search = parse(ordersSearchSchema, location.search);
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.order.getPaginatedOrders.queryOptions(paginatedOrdersQueryFilters(search)),
		);
	},
	pendingComponent: OrdersPageSkeleton,
	validateSearch: ordersSearchSchema,
});

function RouteComponent() {
	const { date, orderStatus, page, pageSize, paymentStatus, searchTerm, sortDirection, sortField } =
		useSearch({ from: "/_dash/orders/" });

	const effectivePaymentStatus = paymentStatus;
	const [inputValue, setInputValue] = useState(searchTerm || "");

	// Status is a tab, not a filter, so it doesn't light up Цэвэрлэх.
	const hasActiveFilters =
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
				sortDirection: undefined,
				sortField: undefined,
			},
			to: "/orders",
		});
	};

	const handleSortChange = (field: string, direction: "asc" | "desc") => {
		navigate({
			search: {
				date,
				orderStatus,
				page: 1,
				pageSize,
				paymentStatus,
				searchTerm,
				sortDirection: direction,
				sortField: field,
			},
			to: "/orders",
		});
	};

	return (
		<div className="mx-auto max-w-7xl space-y-3">
			<Link
				aria-label="Захиалга нэмэх"
				className="bg-primary border-foreground fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 flex size-14 items-center justify-center rounded-full border shadow-lg md:hidden"
				to="/orders/add"
			>
				<Plus className="size-6" />
			</Link>

			<div className="flex gap-2">
				<div className="relative flex-1">
					<Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
					<input
						className="focus:border-foreground border-input h-11 w-full border bg-white pr-10 pl-9 text-[15px] outline-none"
						enterKeyHint="search"
						onBlur={() => inputValue !== (searchTerm ?? "") && handleSearch()}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleSearch()}
						placeholder="Захиалгын дугаар эсвэл утас"
						type="search"
						value={inputValue}
					/>
					{inputValue && (
						<button
							aria-label="Хайлтыг цэвэрлэх"
							className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center"
							onClick={clearSearch}
							type="button"
						>
							<X className="size-4" />
						</button>
					)}
				</div>
				<Button asChild className="hidden h-11 gap-2 px-4 text-sm md:flex">
					<Link to="/orders/add">
						<PlusCircle className="size-4" />
						Захиалга нэмэх
					</Link>
				</Button>
			</div>

			<OrdersFilters
				date={date}
				filtersActive={hasActiveFilters}
				onFilterChange={handleFilterChange}
				onResetFilters={handleResetFilters}
				onSortChange={handleSortChange}
				orderStatus={orderStatus}
				pageSize={pageSize}
				paymentStatus={paymentStatus}
				searchTerm={searchTerm}
				sortDirection={sortDirection}
				sortField={sortField}
			/>

			{/* Orders list */}
			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton className="border-border h-56 border" key={i} />
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
