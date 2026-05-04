import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
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
	Loader2,
	PlusCircle,
	RotateCcw,
	Search,
	Truck,
	X,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";
import { DataPagination } from "@/components/data-pagination";
import OrderCard from "@/components/order/order-card";
import SubmitButton from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/utils/trpc";
import { OrdersPageSkeleton } from "@/components/skeletons/admin-page-skeletons";

const orderStatusTabs = [undefined, ...orderStatusConstants] as const;

function formatStatusLabel(status?: string) {
	if (!status) return "Бүх төлөв";

	return status
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function formatDateDisplay(date?: string) {
	if (!date) return "Өнөөдөр";

	const parsedDate = new Date(`${date}T00:00:00+08:00`);
	return parsedDate.toLocaleDateString("mn-MN", {
		month: "short",
		day: "numeric",
	});
}

function trpcErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Алдаа гарлаа";
}

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
	const hasActiveFilters =
		orderStatus !== undefined ||
		paymentStatus !== undefined ||
		sortField !== undefined ||
		sortDirection !== undefined ||
		searchTerm !== undefined;
	const navigate = useNavigate({ from: Route.fullPath });
	const mutation = useMutation({
		...trpc.order.searchOrder.mutationOptions(),
		onSuccess: (_data) => {},
	});
	const filtersActive = hasActiveFilters || sortField !== "";

	const handleSearch = () => {
		navigate({
			to: "/orders",
			search: {
				date,
				orderStatus,
				page,
				pageSize,
				paymentStatus,
				searchTerm: inputValue,
				sortDirection,
				sortField,
			},
		});
	};
	const clearSearch = () => {
		navigate({
			to: "/orders",
			search: {
				date,
				orderStatus,
				page,
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
				paymentStatus: field === "paymentStatus" ? normalized : paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
				[field]: normalized,
			},
		});
	};
	const handleResetFilters = () => {
		navigate({
			to: "/orders",
			search: {
				orderStatus: undefined,
				paymentStatus: undefined,
				sortField: undefined,
				sortDirection: "asc",
				searchTerm: undefined,
				date: undefined,
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
		<Card className="w-full border-none bg-transparent shadow-none">
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

					<OrdersFilters
						date={date}
						orderStatus={orderStatus}
						paymentStatus={paymentStatus}
						pageSize={pageSize}
						searchTerm={searchTerm}
						sortDirection={sortDirection}
						sortField={sortField}
						filtersActive={filtersActive}
						onFilterChange={handleFilterChange}
						onResetFilters={handleResetFilters}
						onSort={handleSort}
					/>
				</div>

				<Suspense
					fallback={
						<div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
							{Array.from({ length: 6 }).map((_, index) => (
								<Skeleton key={index} className="h-40 border-2 border-border" />
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

function OrdersFilters({
	date,
	orderStatus,
	paymentStatus,
	pageSize,
	searchTerm,
	sortDirection,
	sortField,
	filtersActive,
	onFilterChange,
	onResetFilters,
	onSort,
}: {
	date?: string;
	orderStatus?: string;
	paymentStatus?: string;
	pageSize: number;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
	filtersActive: boolean;
	onFilterChange: (field: string, value: string) => void;
	onResetFilters: () => void;
	onSort: (field: string) => void;
}) {
	const navigate = useNavigate({ from: Route.fullPath });
	const [isDateOpen, setIsDateOpen] = useState(false);
	const selectedDate = date ? new Date(`${date}T00:00:00+08:00`) : undefined;

	const handleDateSelect = (selectedDate: Date | undefined) => {
		if (selectedDate) {
			const dateStr = selectedDate.toISOString().split("T")[0];
			navigate({
				to: "/orders",
				search: {
					date: dateStr,
					orderStatus,
					page: 1,
					pageSize,
					paymentStatus,
					searchTerm,
					sortDirection,
					sortField,
				},
			});
		} else {
			navigate({
				to: "/orders",
				search: {
					date: undefined,
					orderStatus,
					page: 1,
					pageSize,
					paymentStatus,
					searchTerm,
					sortDirection,
					sortField,
				},
			});
		}

		setIsDateOpen(false);
	};

	return (
		<div className="flex flex-col gap-3">
			<Tabs
				value={orderStatus ?? "all"}
				onValueChange={(value) => onFilterChange("orderStatus", value)}
			>
				<TabsList className="scrollbar-thin flex h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl border-2 border-border/60 bg-muted/30 p-1.5 shadow-sm">
					{orderStatusTabs.map((status) => {
						const value = status ?? "all";

						return (
							<TabsTrigger
								key={value}
								value={value}
								className="shrink-0 rounded-xl px-4 py-2 font-medium text-muted-foreground text-xs transition-colors data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm sm:text-sm"
							>
								{formatStatusLabel(status)}
							</TabsTrigger>
						);
					})}
				</TabsList>
			</Tabs>

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
								<span className="truncate">{formatDateDisplay(date)}</span>
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
						value={paymentStatus ?? "all"}
						onValueChange={(value) => onFilterChange("paymentStatus", value)}
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
					{(filtersActive || date) && (
						<Button
							variant="default"
							size="sm"
							onClick={onResetFilters}
							className="h-9 px-3 text-xs"
						>
							<RotateCcw className="mr-1 h-3 w-3" />
							Шинэчлэх
						</Button>
					)}
					<Button
						variant={sortField === "total" ? "default" : "outline"}
						size="sm"
						onClick={() => onSort("total")}
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
						onClick={() => onSort("createdAt")}
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
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: Route.fullPath });
	const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
	const [batchFailed, setBatchFailed] = useState<
		{ orderNumber: string; message: string }[] | null
	>(null);
	const [isBatchSending, setIsBatchSending] = useState(false);

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

	const pendingOnPage = orders.filter((o) => o.status === "pending");
	const allPendingSelected =
		pendingOnPage.length > 0 &&
		pendingOnPage.every((o) => selectedIds.has(o.id));

	useEffect(() => {
		setSelectedIds(new Set());
	}, [
		page,
		pageSize,
		orderStatus,
		paymentStatus,
		date,
		searchTerm,
		sortField,
		sortDirection,
	]);

	const sendTuMutation = useMutation(trpc.order.sendDeliveryTU.mutationOptions());
	const updateStatusMutation = useMutation(
		trpc.order.updateOrderStatus.mutationOptions(),
	);

	const handlePageChange = (nextPage: number) => {
		navigate({
			to: "/orders",
			search: {
				date,
				orderStatus,
				page: nextPage,
				pageSize,
				paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
			},
		});
	};

	const toggleSelectAllPending = () => {
		setSelectedIds((prev) => {
			if (allPendingSelected) return new Set();
			return new Set(pendingOnPage.map((o) => o.id));
		});
	};

	const sendOneTuWithRetry = async (orderId: number) => {
		let lastMessage = "";
		for (let attempt = 1; attempt <= 2; attempt++) {
			try {
				await sendTuMutation.mutateAsync({ orderId });
				return { ok: true as const };
			} catch (e) {
				lastMessage = trpcErrorMessage(e);
				if (attempt < 2) {
					await new Promise((r) => setTimeout(r, 1000));
				}
			}
		}
		return { ok: false as const, message: lastMessage };
	};

	const handleSendTuBatch = async () => {
		if (selectedIds.size === 0) return;
		setIsBatchSending(true);
		const ids = [...selectedIds];
		const failed: { orderNumber: string; message: string }[] = [];
		for (const id of ids) {
			const order = orders.find((o) => o.id === id);
			const result = await sendOneTuWithRetry(id);
			if (!result.ok) {
				failed.push({
					orderNumber: order?.orderNumber ?? String(id),
					message: result.message,
				});
			}
		}
		await queryClient.invalidateQueries({
			...trpc.order.getPaginatedOrders.queryKey,
		});
		setSelectedIds(new Set());
		setIsBatchSending(false);

		const okCount = ids.length - failed.length;
		if (failed.length === 0) {
			toast.success(`${okCount} захиалгыг TU руу илгээлээ`);
		} else if (okCount === 0) {
			toast.error("Илгээлт амжилтгүй");
			setBatchFailed(failed);
		} else {
			toast.warning(`${okCount} амжилттай, ${failed.length} алдаатай`);
			setBatchFailed(failed);
		}
	};

	const handleMarkSelfShipped = async () => {
		if (selectedIds.size === 0) return;
		setIsBatchSending(true);
		const ids = [...selectedIds];
		const failed: { orderNumber: string; message: string }[] = [];
		await Promise.all(
			ids.map(async (id) => {
				const order = orders.find((o) => o.id === id);
				try {
					await updateStatusMutation.mutateAsync({ id, status: "shipped" });
				} catch (e) {
					failed.push({
						orderNumber: order?.orderNumber ?? String(id),
						message: trpcErrorMessage(e),
					});
				}
			}),
		);
		await queryClient.invalidateQueries({
			...trpc.order.getPaginatedOrders.queryKey,
		});
		setSelectedIds(new Set());
		setIsBatchSending(false);

		if (failed.length === 0) {
			toast.success("Сонгосон захиалгыг илгээсэн гэж тэмдэглэлээ");
		} else {
			toast.error("Зарим захиалгыг шинэчилж чадсангүй");
			setBatchFailed(failed);
		}
	};

	const canTuSend = selectedIds.size > 0 && !isBatchSending;

	const toolbarOpen = selectedIds.size > 0;

	return (
		<>
			{pendingOnPage.length > 0 ? (
				<div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border/60 bg-background/80 px-3 py-2.5">
					<label className="flex cursor-pointer select-none items-center gap-2 text-sm">
						<Checkbox
							checked={allPendingSelected}
							onCheckedChange={() => toggleSelectAllPending()}
							aria-label="Энэ хуудсан дээрх бүх хүлээгдэж буй захиалгыг сонгох"
						/>
						<span className="text-muted-foreground">
							Хүлээгдэж буй (
							<span className="font-medium text-foreground">
								{pendingOnPage.length}
							</span>
							) сонгох
						</span>
					</label>
				</div>
			) : null}

			<div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
				{orders.map((order) => (
					<div key={order.orderNumber} className="min-w-0">
						<OrderCard
							order={order}
							selection={
								order.status === "pending"
									? {
											checked: selectedIds.has(order.id),
											onCheckedChange: (checked) => {
												setSelectedIds((prev) => {
													const next = new Set(prev);
													if (checked) next.add(order.id);
													else next.delete(order.id);
													return next;
												});
											},
										}
									: undefined
							}
						/>
					</div>
				))}
			</div>

			<div className="mt-6">
				<DataPagination
					currentPage={pagination.currentPage}
					totalItems={pagination.totalCount}
					itemsPerPage={pageSize}
					onPageChange={handlePageChange}
				/>
			</div>

			{toolbarOpen ? (
				<>
					<div
						className="h-[calc(5.25rem+env(safe-area-inset-bottom,0px))] shrink-0 sm:hidden"
						aria-hidden
					/>
					<TooltipProvider delayDuration={400}>
						<div
							className={[
								"fixed z-40 border-border/80 bg-background/95 backdrop-blur-md",
								"inset-x-0 bottom-0 rounded-none border-t pb-[env(safe-area-inset-bottom,0px)]",
								"shadow-[0_-8px_28px_rgba(0,0,0,0.06)]",
								"sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[min(100%-2rem,28rem)] sm:-translate-x-1/2",
								"sm:rounded-2xl sm:border-2 sm:shadow-lg",
							].join(" ")}
						>
							<div className="flex flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3">
								<div className="text-sm sm:min-w-0 sm:pr-2">
									<p className="font-medium text-foreground leading-tight">
										{selectedIds.size} сонгогдсон
									</p>
									<p className="text-muted-foreground text-xs leading-snug sm:hidden">
										TU руу илгээх эсвэл цэснээс өөрөөр хүргэсэн.
									</p>
									<p className="mt-0.5 hidden text-muted-foreground text-xs sm:block sm:truncate">
										Зөвхөн хүлээгдэж буй захиалга сонгогдоно.
									</p>
								</div>
								<div className="flex w-full flex-wrap items-stretch gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
									<Button
										variant="ghost"
										size="sm"
										disabled={isBatchSending}
										onClick={() => setSelectedIds(new Set())}
										className="shrink-0 touch-manipulation"
									>
										Цэвэрлэх
									</Button>
									<div className="flex min-w-0 flex-1 sm:flex-initial">
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex min-w-0 flex-1 sm:flex-initial">
													<Button
														size="sm"
														className="h-10 min-w-0 flex-1 touch-manipulation gap-2 rounded-r-none border-border border-r sm:h-9 sm:flex-initial"
														disabled={!canTuSend}
														onClick={() => void handleSendTuBatch()}
													>
														{isBatchSending ? (
															<Loader2 className="h-4 w-4 shrink-0 animate-spin" />
														) : (
															<Truck className="h-4 w-4 shrink-0" />
														)}
														<span className="truncate">TU руу илгээх</span>
													</Button>
												</span>
											</TooltipTrigger>
											<TooltipContent
												side="top"
												className="hidden max-w-[min(90vw,18rem)] space-y-1.5 text-left text-xs sm:block"
											>
												<p className="font-medium text-foreground">Үндсэн: TU API</p>
												<p className="text-muted-foreground leading-relaxed">
													Ойрын хаягийг өөрөө авах бол цэснээс «Өөрөөр хүргэсэн»
													сонгоно.
												</p>
											</TooltipContent>
										</Tooltip>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													size="sm"
													className="h-10 shrink-0 touch-manipulation rounded-l-none px-3 sm:h-9"
													disabled={selectedIds.size === 0 || isBatchSending}
													aria-label="Нэмэлт сонголт"
												>
													<ChevronDown className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="end"
												className="w-[min(calc(100vw-2rem),18rem)]"
											>
												<DropdownMenuItem
													className="touch-manipulation"
													onClick={() => void handleMarkSelfShipped()}
												>
													Өөрөөр хүргэсэн (илгээсэн болгох)
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								</div>
							</div>
						</div>
					</TooltipProvider>
				</>
			) : null}

			<Dialog
				open={batchFailed !== null && batchFailed.length > 0}
				onOpenChange={(open) => {
					if (!open) setBatchFailed(null);
				}}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Илгээж чадсангүй</DialogTitle>
					</DialogHeader>
					<ul className="space-y-2 text-sm">
						{batchFailed?.map((row) => (
							<li
								key={row.orderNumber}
								className="rounded-lg border border-border bg-muted/40 px-3 py-2"
							>
								<span className="font-medium">#{row.orderNumber}</span>
								<p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
									{row.message}
								</p>
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button variant="secondary" onClick={() => setBatchFailed(null)}>
							Хаах
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
