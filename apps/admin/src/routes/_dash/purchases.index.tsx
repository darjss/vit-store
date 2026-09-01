import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { PRODUCT_PER_PAGE, purchaseProvider, purchaseStatus } from "@vit/shared";
import { Package, Plus, Search } from "lucide-react";
import { Suspense, useState } from "react";
import * as v from "valibot";
import { PurchasesPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { purchaseStatusLabel } from "@/lib/enum-labels";
import { formatCurrency, formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const purchaseProviderLabel: Record<(typeof purchaseProvider)[number], string> = {
	amazon: "Amazon",
	iherb: "iHerb",
	naturebell: "Naturebell",
	unknown: "Тодорхойгүй",
};

export const Route = createFileRoute("/_dash/purchases/")({
	component: RouteComponent,
	loader: ({ context: ctx, location }) => {
		const search = location.search as {
			page?: number;
			pageSize?: number;
			provider?: (typeof purchaseProvider)[number];
			searchTerm?: string;
			sortDirection?: "asc" | "desc";
			sortField?: string;
			status?: (typeof purchaseStatus)[number];
		};
		void ctx.queryClient.prefetchQuery(
			ctx.trpc.purchase.getPaginatedPurchases.queryOptions({
				page: search.page ?? 1,
				pageSize: search.pageSize ?? PRODUCT_PER_PAGE,
				provider: search.provider,
				searchTerm: search.searchTerm,
				sortDirection: search.sortDirection ?? "desc",
				sortField: search.sortField,
				status: search.status,
			}),
		);
	},
	pendingComponent: PurchasesPageSkeleton,
	validateSearch: v.object({
		page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
		pageSize: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), PRODUCT_PER_PAGE),
		provider: v.optional(v.picklist(purchaseProvider)),
		searchTerm: v.optional(v.string()),
		sortDirection: v.optional(v.picklist(["asc", "desc"])),
		sortField: v.optional(v.string()),
		status: v.optional(v.picklist(purchaseStatus)),
	}),
});

function RouteComponent() {
	return (
		<Suspense fallback={<PurchasesPageSkeleton />}>
			<PurchasesPage />
		</Suspense>
	);
}

function PurchasesPage() {
	const navigate = useNavigate({ from: "/_dash/purchases/" });
	const { page, pageSize, provider, searchTerm, sortDirection, sortField, status } = useSearch({
		from: "/_dash/purchases/",
	});
	const [searchValue, setSearchValue] = useState(searchTerm ?? "");

	const { data } = useSuspenseQuery(
		trpc.purchase.getPaginatedPurchases.queryOptions({
			page,
			pageSize,
			provider,
			searchTerm,
			sortDirection: sortDirection ?? "desc",
			sortField,
			status,
		}),
	);

	const updateSearch = (
		next: Partial<{
			page: number;
			pageSize: number;
			provider?: (typeof purchaseProvider)[number];
			searchTerm?: string;
			sortDirection?: "asc" | "desc";
			sortField?: string;
			status?: (typeof purchaseStatus)[number];
		}>,
	) => {
		navigate({
			search: {
				page,
				pageSize,
				provider,
				searchTerm,
				sortDirection,
				sortField,
				status,
				...next,
			},
			to: "/purchases",
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button asChild className="gap-2">
					<Link to="/purchases/add">
						<Plus className="h-4 w-4" />
						Худалдан авалт нэмэх
					</Link>
				</Button>
			</div>

			<div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_180px_180px_auto]">
				<div className="relative">
					<Search className="text-muted-foreground absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2" />
					<Input
						className="rounded-base border-border bg-background shadow-shadow h-12 border-2 pr-14 pl-14"
						onChange={(event) => setSearchValue(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								updateSearch({ page: 1, searchTerm: searchValue });
							}
						}}
						placeholder="Захиалгын дугаар эсвэл трек кодоор хайх"
						value={searchValue}
					/>
				</div>

				<Select
					onValueChange={(value) =>
						updateSearch({
							page: 1,
							provider: value === "all" ? undefined : (value as (typeof purchaseProvider)[number]),
						})
					}
					value={provider ?? "all"}
				>
					<SelectTrigger className="rounded-base border-border bg-background shadow-shadow h-12 border-2">
						<SelectValue placeholder="Бүх нийлүүлэгч" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Бүх нийлүүлэгч</SelectItem>
						{purchaseProvider.map((value) => (
							<SelectItem key={value} value={value}>
								{purchaseProviderLabel[value]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Select
					onValueChange={(value) =>
						updateSearch({
							page: 1,
							status: value === "all" ? undefined : (value as (typeof purchaseStatus)[number]),
						})
					}
					value={status ?? "all"}
				>
					<SelectTrigger className="rounded-base border-border bg-background shadow-shadow h-12 border-2">
						<SelectValue placeholder="Бүх төлөв" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Бүх төлөв</SelectItem>
						{purchaseStatus.map((value) => (
							<SelectItem key={value} value={value}>
								{purchaseStatusLabel[value]}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<Button
					className="rounded-base border-border shadow-shadow h-12 border-2"
					onClick={() => updateSearch({ page: 1, searchTerm: searchValue })}
					type="button"
				>
					Хайх
				</Button>
			</div>

			<div className="space-y-4">
				{data.purchases.length === 0 ? (
					<div className="rounded-base border-border bg-card text-muted-foreground border-2 p-12 text-center">
						<Package className="mx-auto mb-3 h-10 w-10" />
						<p>Худалдан авалт олдсонгүй.</p>
					</div>
				) : (
					data.purchases.map((purchase) => (
						<Link
							className="rounded-base border-border bg-card shadow-shadow block border-2 p-5 transition-transform hover:-translate-y-0.5"
							key={purchase.id}
							params={{ id: String(purchase.id) }}
							to="/purchases/$id"
						>
							<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
								<div className="space-y-3">
									<div className="flex flex-wrap items-center gap-2">
										<span className="rounded-full border px-3 py-1 text-xs uppercase">
											{purchaseProviderLabel[purchase.provider]}
										</span>
										<span className="rounded-full border px-3 py-1 text-xs uppercase">
											{purchaseStatusLabel[purchase.status]}
										</span>
									</div>
									<div>
										<h2 className="font-heading text-lg">{purchase.externalOrderNumber}</h2>
										<p className="text-muted-foreground text-sm">
											Трек код: {purchase.trackingNumber || "Байхгүй"}
										</p>
									</div>
									<div className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-2">
										<p>
											Захиалсан:{" "}
											{purchase.orderedAt ? formatDateToText(purchase.orderedAt) : "Оруулаагүй"}
										</p>
										<p>
											Хүлээн авсан:{" "}
											{purchase.receivedAt
												? formatDateToText(purchase.receivedAt)
												: "Хүлээгдэж буй"}
										</p>
										<p>{purchase.itemCount} бараа</p>
										<p>Нийт: {formatCurrency(purchase.totalCost)}</p>
									</div>
								</div>
							</div>
						</Link>
					))
				)}
			</div>

			<div className="flex items-center justify-between">
				<p className="text-muted-foreground text-sm">{data.pagination.totalCount} худалдан авалт</p>
				<div className="flex items-center gap-2">
					<Button
						disabled={!data.pagination.hasPreviousPage}
						onClick={() => updateSearch({ page: page - 1 })}
						type="button"
						variant="outline"
					>
						Өмнөх
					</Button>
					<span className="text-sm">
						Хуудас {data.pagination.currentPage} / {Math.max(data.pagination.totalPages, 1)}
					</span>
					<Button
						disabled={!data.pagination.hasNextPage}
						onClick={() => updateSearch({ page: page + 1 })}
						type="button"
						variant="outline"
					>
						Дараах
					</Button>
				</div>
			</div>
		</div>
	);
}
