import { useMutation } from "@tanstack/react-query";
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
import { Loader2, PlusCircle, RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";
import SubmitButton from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/utils/trpc";
import { OrdersPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import OrdersFilters from "@/components/order/orders-filters";
import OrdersList from "@/components/order/orders-list";
import PendingTransferWidget from "@/components/order/pending-transfer-widget";

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	pendingComponent: OrdersPageSkeleton,
	loader: ({ context: ctx, location }) => {
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
		void ctx.queryClient.prefetchQuery(
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
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.payment.getClaimedTransferCount.queryOptions(),
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

	const effectivePaymentStatus = paymentStatus;
	const [inputValue, setInputValue] = useState(searchTerm || "");
	const [filtersOpen, setFiltersOpen] = useState(false);

	const hasActiveFilters =
		orderStatus !== undefined ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined ||
		(date !== undefined && date !== "all");

	const navigate = useNavigate({ from: Route.fullPath });
	const mutation = useMutation({
		...Route.useRouteContext().trpc.order.searchOrder.mutationOptions(),
		onSuccess: () => {},
	});

	const handleSearch = () => {
		navigate({
			to: "/orders",
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
		});
	};

	const clearSearch = () => {
		setInputValue("");
		navigate({
			to: "/orders",
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
		});
	};

	const handleFilterChange = (field: string, value: string) => {
		const normalized = value === "all" ? undefined : value;
		navigate({
			to: "/orders",
			search: {
				date,
				orderStatus: field === "orderStatus" ? normalized : orderStatus,
				page: 1,
				pageSize,
				paymentStatus:
					field === "paymentStatus" ? normalized : paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
				[field]: normalized,
			},
		});
	};

	const handleResetFilters = () => {
		setInputValue("");
		navigate({
			to: "/orders",
			search: {
				orderStatus: undefined,
				paymentStatus: undefined,
				sortField: undefined,
				sortDirection: "asc",
				searchTerm: undefined,
				date: "all",
				page: 1,
			},
		});
	};

	const handleSort = (field: string) => {
		const newDirection =
			sortField === field && sortDirection === "asc" ? "desc" : "asc";
		navigate({
			to: "/orders",
			search: {
				date,
				orderStatus,
				page,
				pageSize,
				paymentStatus,
				searchTerm,
				sortField: field,
				sortDirection: newDirection,
			},
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
					<p className="mt-0.5 text-muted-foreground text-sm">
						Захиалгыг удирдах, илгээх, хүргэлтийн мэдээлэл оруулах
					</p>
				</div>
				<Button
					className="h-11 gap-2 shadow-hard"
					asChild
					disabled={mutation.isPending}
				>
					<Link to="/orders/add">
						<PlusCircle className="h-4 w-4" />
						<span className="hidden sm:inline">Захиалга нэмэх</span>
						<span className="sm:hidden">Нэмэх</span>
					</Link>
				</Button>
			</div>

			<PendingTransferWidget />

			{/* Search */}
			<div className="relative">
				<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Захиалгын дугаар, утас хайх..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleSearch()}
					className="h-12 border-2 border-border bg-card pl-10 pr-24 text-base shadow-hard-sm"
					disabled={mutation.isPending}
				/>
				<div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
					{inputValue && (
						<Button
							size="icon"
							variant="ghost"
							className="h-8 w-8"
							onClick={clearSearch}
							disabled={mutation.isPending}
							aria-label="Хайлтыг цэвэрлэх"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
					<SubmitButton
						onClick={handleSearch}
						className="h-9 px-3 text-xs"
						isPending={mutation.isPending}
						aria-label="Хайх"
					>
						<Search className="h-4 w-4" />
					</SubmitButton>
				</div>
			</div>

			{/* Filters */}
			<div className="space-y-3">
				<div className="flex items-center gap-2 sm:hidden">
					<Button
						variant={filtersOpen ? "default" : "outline"}
						size="sm"
						className="h-10 gap-2"
						onClick={() => setFiltersOpen(!filtersOpen)}
					>
						<SlidersHorizontal className="h-4 w-4" />
						Шүүлтүүр
						{hasActiveFilters && (
							<span className="ml-1 flex h-5 w-5 items-center justify-center bg-primary-foreground text-primary font-bold text-[10px]">
								!
							</span>
						)}
					</Button>
					{hasActiveFilters && (
						<Button
							variant="ghost"
							size="sm"
							className="h-10 gap-1.5"
							onClick={handleResetFilters}
						>
							<RotateCcw className="h-3.5 w-3.5" />
							Цэвэрлэх
						</Button>
					)}
				</div>

				<div
					className={`space-y-3 ${filtersOpen ? "block" : "hidden sm:block"}`}
				>
					<OrdersFilters
						date={date}
						orderStatus={orderStatus}
						paymentStatus={paymentStatus}
						pageSize={pageSize}
						searchTerm={searchTerm}
						sortDirection={sortDirection}
						sortField={sortField}
						filtersActive={hasActiveFilters}
						onFilterChange={handleFilterChange}
						onResetFilters={handleResetFilters}
						onSort={handleSort}
					/>
				</div>
			</div>

			{/* Orders list */}
			<Suspense
				fallback={
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{Array.from({ length: 6 }).map((_, i) => (
							<Skeleton
								key={i}
								className="h-56 border-2 border-border shadow-hard-sm"
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
					paymentStatus={effectivePaymentStatus}
					date={date}
				/>
			</Suspense>
		</div>
	);
}
