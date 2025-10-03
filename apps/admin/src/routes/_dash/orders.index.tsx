import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { RotateCcw, ArrowUpDown, PlusCircle } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useSuspenseQueries } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { z } from "zod";
import OrderCard from "@/components/order/order-card";
import { orderStatus as orderStatusConstants, paymentStatus as paymentStatusConstants } from "@/lib/constants";

export const Route = createFileRoute("/_dash/orders/")({
	component: RouteComponent,
	loader: async ({context:ctx})=>{
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
	const [inputValue, setInputValue] = useState("");
	const {
		page,pageSize,searchTerm,sortField,sortDirection,orderStatus,paymentStatus,
} = useSearch({ from: "/_dash/orders/" });
	const hasActiveFilters =
		orderStatus !== undefined ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
	const navigate = useNavigate({ from: Route.fullPath });
	const [
		{ data: ordersData, isPending: _isPending },
	] = useSuspenseQueries({
		queries: [
			trpc.order.getPaginatedOrders.queryOptions({
				page,
				pageSize,
				sortField,
				sortDirection,
				orderStatus,
				paymentStatus,
			}),
		],
	});
	const mutation = useMutation({
		...trpc.order.searchOrder.mutationOptions(),
		onSuccess: (data) => {
			console.log("data", data);
		},
	});
	const orders = ordersData.orders;
	const _pagination = ordersData.pagination;
	const handleSearch = () => {
		console.log("search");
	};
	const clearSearch = () => {
		console.log("clear search");
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
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				sortField: field,
			}),
		});
	};
	const _handleNextPage = (cursor: string) => {
		console.log("next page", cursor);
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				page: prev.page + 1,
			}),
		});
	};
	const _handlePreviousPage = () => {
		console.log("previous page");
		navigate({
			to: "/orders",
			search: (prev) => ({
				...prev,
				page: prev.page - 1,
			}),
		});
	};
	return     (<Card className="w-full bg-transparent">
	<CardContent className="space-y-6 p-2 sm:p-6">
	  <div className="space-y-4">
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
		  <div className="relative flex-1">
			<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input
			  placeholder="Search Order# or Customer..."
			  value={inputValue}
			  onChange={(e) => setInputValue(e.target.value)}
			  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
			  className="h-9 w-full rounded-lg bg-background pl-8"
			  disabled={mutation.isPending}
			/>
			{inputValue && (
			  <Button
				size="icon"
				className="absolute right-10 top-1/2 h-6 w-6 -translate-y-1/2"
				onClick={clearSearch}
				disabled={mutation.isPending}
				aria-label="Clear search"
			  >
				<X className="h-4 w-4" />
			  </Button>
			)}
			<SubmitButton
			  onClick={handleSearch}
			  className="absolute right-0 top-1/2 h-9 w-9 -translate-y-1/2 rounded-l-none p-0"
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
			  <span className="whitespace-nowrap">
				Add Order
			  </span>
			</Link>
		  </Button>
		</div>

		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
		  <div className="flex gap-2">
			<Select
			  value={orderStatus ?? "all"}
			  onValueChange={(value) =>
				handleFilterChange("orderStatus", value)
			  }			>
			  <SelectTrigger className="h-9 w-full sm:w-[140px]">
				<SelectValue placeholder="All Statuses" />
			  </SelectTrigger>
			  <SelectContent>
				<SelectItem value="all">All Statuses</SelectItem>
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
				<SelectItem value="all">All Payments</SelectItem>
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
				Reset
			  </Button>
			)}
			<Button
			  variant="default"
			  size="sm"
			  onClick={() => handleSort("total")}
			  className="h-9 px-3"
			>
			  Total
			  <ArrowUpDown
				className={`ml-1 h-4 w-4 ${
				  sortField === "total" ? "opacity-100" : "opacity-50"
				}`}
			  />
			</Button>
			<Button
			  variant="default"
			  size="sm"
			  onClick={() => handleSort("createdAt")}
			  className="h-9 px-3"
			>
			  Date
			  <ArrowUpDown
				className={`ml-1 h-4 w-4 ${
				  sortField === "createdAt" ? "opacity-100" : "opacity-50"
				}`}
			  />
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
        {/* <DataPagination
          hasNextPage={_pagination.hasNextPage}
          hasPreviousPage={_pagination.hasPreviousPage}
          onNextPage={handleNextPage
          }
          onPreviousPage={handlePreviousPage
          }
          isLoading={_isPending}
        /> */}
      </div>
	</CardContent>
  </Card>)
}
