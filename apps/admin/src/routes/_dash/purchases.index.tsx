import { useSuspenseQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import {
	PRODUCT_PER_PAGE,
	purchaseProvider,
	purchaseStatus,
} from "@vit/shared";
import { Package, Plus, Search } from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/purchases/")({
	component: RouteComponent,
	loader: async ({ context: ctx, location }) => {
		const search = location.search as {
			page?: number;
			pageSize?: number;
			searchTerm?: string;
			provider?: (typeof purchaseProvider)[number];
			status?: (typeof purchaseStatus)[number];
			sortField?: string;
			sortDirection?: "asc" | "desc";
		};
		await ctx.queryClient.ensureQueryData(
			ctx.trpc.purchase.getPaginatedPurchases.queryOptions({
				page: search.page ?? 1,
				pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
				searchTerm: search.searchTerm,
				provider: search.provider,
				status: search.status,
				sortField: search.sortField,
				sortDirection: search.sortDirection ?? "desc",
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
		provider: v.optional(v.picklist(purchaseProvider)),
		status: v.optional(v.picklist(purchaseStatus)),
		sortField: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
	}),
});

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading purchases...</div>}>
			<PurchasesPage />
		</Suspense>
	);
}

function PurchasesPage() {
	const navigate = useNavigate({ from: "/_dash/purchases/" });
	const {
		page,
		pageSize,
		provider,
		searchTerm,
		sortDirection,
		sortField,
		status,
	} = useSearch({ from: "/_dash/purchases/" });
	const [searchValue, setSearchValue] = useState(searchTerm ?? "");

	const { data } = useSuspenseQuery(
		trpc.purchase.getPaginatedPurchases.queryOptions({
			page,
			pageSize,
			searchTerm,
			provider,
			status,
			sortField,
			sortDirection: sortDirection ?? "desc",
		}),
	);

	const updateSearch = (
		next: Partial<{
			page: number;
			pageSize: number;
			searchTerm?: string;
			provider?: (typeof purchaseProvider)[number];
			status?: (typeof purchaseStatus)[number];
			sortField?: string;
			sortDirection?: "asc" | "desc";
		}>,
	) => {
		navigate({
			to: "/purchases",
			search: {
				page,
				pageSize,
				searchTerm,
				provider,
				status,
				sortField,
				sortDirection,
				...next,
			},
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button asChild className="gap-2">
					<Link to="/purchases/add">
						<Plus className="h-4 w-4" />
						Add purchase
					</Link>
				</Button>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_180px_180px_auto]">
				<div className="relative">
					<Search className="-translate-y-1/2 absolute top-1/2 left-4 h-5 w-5 text-muted-foreground" />
					<Input
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								updateSearch({ searchTerm: searchValue, page: 1 });
							}
						}}
						placeholder="Search by order number or tracking"
						className="h-12 rounded-base border-2 border-border bg-background pr-14 pl-14 shadow-shadow"
					/>
				</div>

				<Select
					value={provider ?? "all"}
					onValueChange={(value) =>
						updateSearch({
							provider:
								value === "all"
									? undefined
									: (value as (typeof purchaseProvider)[number]),
							page: 1,
						})
					}
				>
					<SelectTrigger className="h-12 rounded-base border-2 border-border bg-background shadow-shadow">
						<SelectValue placeholder="All providers" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All providers</SelectItem>
						{purchaseProvider.map((value) => (
							<SelectItem key={value} value={value}>
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					value={status ?? "all"}
					onValueChange={(value) =>
						updateSearch({
							status:
								value === "all"
									? undefined
									: (value as (typeof purchaseStatus)[number]),
							page: 1,
						})
					}
				>
					<SelectTrigger className="h-12 rounded-base border-2 border-border bg-background shadow-shadow">
						<SelectValue placeholder="All statuses" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All statuses</SelectItem>
						{purchaseStatus.map((value) => (
							<SelectItem key={value} value={value}>
								{value}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					type="button"
					onClick={() => updateSearch({ searchTerm: searchValue, page: 1 })}
					className="h-12 rounded-base border-2 border-border shadow-shadow"
				>
					Search
				</Button>
			</div>

			<div className="space-y-4">
				{data.purchases.length === 0 ? (
					<div className="rounded-base border-2 border-border bg-card p-12 text-center text-muted-foreground">
						<Package className="mx-auto mb-3 h-10 w-10" />
						<p>No purchases found.</p>
					</div>
				) : (
					data.purchases.map((purchase) => (
						<Link
							key={purchase.id}
							to="/purchases/$id"
							params={{ id: String(purchase.id) }}
							className="hover:-translate-y-0.5 block rounded-base border-2 border-border bg-card p-5 shadow-shadow transition-transform"
						>
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full border px-3 py-1 text-xs uppercase">
											{purchase.provider}
										</span>
										<span className="rounded-full border px-3 py-1 text-xs uppercase">
											{purchase.status.replaceAll("_", " ")}
										</span>
									</div>
									<div>
										<h2 className="font-heading text-lg">
											{purchase.externalOrderNumber}
										</h2>
										<p className="text-muted-foreground text-sm">
											Tracking: {purchase.trackingNumber || "N/A"}
										</p>
									</div>
									<div className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-2">
										<p>
											Ordered:{" "}
											{purchase.orderedAt
												? formatDateToText(purchase.orderedAt)
												: "Not set"}
										</p>
										<p>
											Received:{" "}
											{purchase.receivedAt
												? formatDateToText(purchase.receivedAt)
												: "Pending"}
										</p>
										<p>{purchase.itemCount} items</p>
										<p>Total: {formatCurrency(purchase.totalCost)}</p>
									</div>
								</div>
							</div>
						</Link>
					))
				)}
			</div>

			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">
					{data.pagination.totalCount} purchases
				</p>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={!data.pagination.hasPreviousPage}
						onClick={() => updateSearch({ page: page - 1 })}
					>
						Previous
					</Button>
					<span className="text-sm">
						Page {data.pagination.currentPage} /{" "}
						{Math.max(data.pagination.totalPages, 1)}
					</span>
					<Button
						type="button"
						variant="outline"
						disabled={!data.pagination.hasNextPage}
						onClick={() => updateSearch({ page: page + 1 })}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
