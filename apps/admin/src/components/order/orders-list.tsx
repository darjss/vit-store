import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Loader2, Package, Truck } from "lucide-react";
import { match } from "dismatch";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AdminBatchFailure } from "@vit/shared";
import {
	type orderStatus as orderStatusConstants,
	type paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import { DataPagination } from "@/components/data-pagination";
import { Button } from "@/components/ui/button";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	batchShipOrdersMutationOptions,
	batchUpdateOrderStatusMutationOptions,
} from "@/lib/admin-result-options";
import {
	presentAdminOrderError,
	showErrorPresentation,
} from "@/lib/error-presentations";
import { trpc } from "@/utils/trpc";
import OrderCard from "./order-card";

const activeOrderStatuses = ["created", "pending", "shipped"] as const;

type MatchableBatchFailure = Omit<AdminBatchFailure, "errorTag"> &
	(
		| { errorTag: "OrderNotFound" }
		| { errorTag: "InvalidOrderTransition" }
		| { errorTag: "StockConflict" }
		| { errorTag: "DeliverySubmissionFailed" }
	);

const batchFailureDescription = (failure: AdminBatchFailure) =>
	match(
		failure as MatchableBatchFailure,
		"errorTag",
	)<string>({
		OrderNotFound: () => "Захиалга олдсонгүй.",
		InvalidOrderTransition: () =>
			"Захиалгын төлөв энэ үйлдлийг зөвшөөрөхгүй байна.",
		StockConflict: () => "Барааны нөөц өөрчлөгдсөн байна.",
		DeliverySubmissionFailed: () => "Хүргэлтийн үйлчилгээ хариу өгсөнгүй.",
	});

interface OrdersListProps {
	page: number;
	pageSize: number;
	searchTerm?: string;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	orderStatus?: string;
	paymentStatus?: string;
	date?: string;
}

export default function OrdersList({
	page,
	pageSize,
	searchTerm,
	sortField,
	sortDirection,
	orderStatus,
	paymentStatus,
	date,
}: OrdersListProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: "/orders" });
	const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
	const [batchFailed, setBatchFailed] = useState<AdminBatchFailure[] | null>(
		null,
	);

	const { data: ordersData } = useSuspenseQuery({
		...trpc.order.getPaginatedOrders.queryOptions({
			page,
			includeAllStatuses: orderStatus === "all",
			paymentStatus: paymentStatus as
				| (typeof paymentStatusConstants)[number]
				| undefined,
			pageSize,
			sortField,
			sortDirection,
			orderStatus:
				orderStatus === "all" || orderStatus === "active"
					? undefined
					: (orderStatus as (typeof orderStatusConstants)[number] | undefined),
			orderStatuses:
				orderStatus === "active" ? [...activeOrderStatuses] : undefined,
			searchTerm,
			date,
		}),
		refetchInterval: 15_000,
		refetchOnWindowFocus: true,
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

	const batchShipMutation = useMutation(batchShipOrdersMutationOptions);
	const batchStatusMutation = useMutation(
		batchUpdateOrderStatusMutationOptions,
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

	const selectedOrders = () =>
		orders.flatMap((order) =>
			selectedIds.has(order.id)
				? [{ id: order.id, orderNumber: order.orderNumber }]
				: [],
		);

	const handleBatchError = (
		error: Parameters<typeof presentAdminOrderError>[0],
	) => {
		showErrorPresentation(presentAdminOrderError(error));
		match(
			error,
			"_tag",
		)({
			OrderNotFound: () => setBatchFailed(null),
			InvalidOrderTransition: () => setBatchFailed(null),
			StockConflict: () => setBatchFailed(null),
			DeliverySubmissionFailed: () => setBatchFailed(null),
			BatchPartiallyFailed: ({ failures }) => setBatchFailed(failures),
		});
	};

	const handleSendTuBatch = async () => {
		const selected = selectedOrders();
		if (selected.length === 0) return;
		const result = await batchShipMutation.mutateAsync({ orders: selected });
		result.match({
			ok: ({ succeeded }) =>
				toast.success(`${succeeded} захиалгыг TU руу илгээлээ`),
			err: handleBatchError,
		});
		await queryClient.invalidateQueries(
			trpc.order.getPaginatedOrders.queryOptions({}),
		);
		setSelectedIds(new Set());
	};

	const handleMarkSelfShipped = async () => {
		const selected = selectedOrders();
		if (selected.length === 0) return;
		const result = await batchStatusMutation.mutateAsync({
			orders: selected,
			status: "shipped",
		});
		result.match({
			ok: ({ succeeded }) =>
				toast.success(`${succeeded} захиалгыг илгээсэн гэж тэмдэглэлээ`),
			err: handleBatchError,
		});
		await queryClient.invalidateQueries(
			trpc.order.getPaginatedOrders.queryOptions({}),
		);
		setSelectedIds(new Set());
	};

	const isBatchSending =
		batchShipMutation.isPending || batchStatusMutation.isPending;
	const canTuSend = selectedIds.size > 0 && !isBatchSending;
	const toolbarOpen = selectedIds.size > 0;

	return (
		<>
			{/* Batch select header */}
			{pendingOnPage.length > 0 && (
				<div className="flex items-center gap-3 border-2 border-border bg-card px-4 py-3 shadow-hard-sm">
					<label className="flex cursor-pointer select-none items-center gap-3 text-sm">
						<Checkbox
							checked={allPendingSelected}
							onCheckedChange={() => toggleSelectAllPending()}
							aria-label="Энэ хуудсан дээрх бүх хүлээгдэж буй захиалгыг сонгох"
							className="h-5 w-5"
						/>
						<span className="text-muted-foreground">
							Хүлээгдэж буй{" "}
							<span className="font-bold text-foreground">
								{pendingOnPage.length}
							</span>{" "}
							сонгох
						</span>
					</label>
				</div>
			)}

			{/* Order grid */}
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
				{orders.map((order) => (
					<OrderCard
						key={order.orderNumber}
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
				))}
			</div>

			{/* Empty state */}
			{orders.length === 0 && (
				<div className="flex flex-col items-center justify-center border-2 border-dashed border-border py-16">
					<Package className="mb-3 h-12 w-12 text-muted-foreground" />
					<p className="font-heading font-bold text-lg">Захиалга олдсонгүй</p>
					<p className="mt-1 text-muted-foreground text-sm">
						Шүүлтүүр эсвэл хайлтаа өөрчлөөд дахин оролдоно уу
					</p>
				</div>
			)}

			{/* Pagination */}
			{orders.length > 0 && (
				<div className="pt-4">
					<DataPagination
						currentPage={pagination.currentPage}
						totalItems={pagination.totalCount}
						itemsPerPage={pageSize}
						onPageChange={handlePageChange}
					/>
				</div>
			)}

			{/* Batch toolbar */}
			{toolbarOpen && (
				<>
					<div
						className="h-[calc(5.25rem+env(safe-area-inset-bottom,0px))] shrink-0 sm:hidden"
						aria-hidden
					/>
					<TooltipProvider delayDuration={400}>
						<div
							className={[
								"fixed z-40 border-t-2 border-border bg-card/95 backdrop-blur-md",
								"inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom,0px)]",
								"shadow-[0_-8px_28px_rgba(0,0,0,0.08)]",
								"sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[min(100%-2rem,28rem)] sm:-translate-x-1/2",
								"sm:rounded-none sm:border-2 sm:shadow-hard",
							].join(" ")}
						>
							<div className="flex items-center justify-between gap-4 px-4 py-3">
								<div className="min-w-0">
									<p className="font-heading font-bold text-sm">
										{selectedIds.size} сонгогдсон
									</p>
									<p className="text-muted-foreground text-xs">
										Зөвхөн хүлээгдэж буй захиалга
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<Button
										variant="ghost"
										size="sm"
										disabled={isBatchSending}
										onClick={() => setSelectedIds(new Set())}
										className="h-10"
									>
										Цэвэрлэх
									</Button>
									<div className="flex">
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex">
													<Button
														size="sm"
														className="h-10 gap-2 rounded-r-none border-r-2 border-border"
														disabled={!canTuSend}
														onClick={() => void handleSendTuBatch()}
													>
														{isBatchSending ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<Truck className="h-4 w-4" />
														)}
														<span className="hidden sm:inline">
															TU руу илгээх
														</span>
														<span className="sm:hidden">Илгээх</span>
													</Button>
												</span>
											</TooltipTrigger>
											<TooltipContent
												side="top"
												className="hidden max-w-xs space-y-1 text-left text-xs sm:block"
											>
												<p className="font-bold">Үндсэн: TU API</p>
												<p className="text-muted-foreground">
													Ойрын хаягийг өөрөө авах бол «Өөрөөр хүргэсэн»
													сонгоно.
												</p>
											</TooltipContent>
										</Tooltip>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													size="sm"
													className="h-10 rounded-l-none px-3"
													disabled={selectedIds.size === 0 || isBatchSending}
													aria-label="Нэмэлт сонголт"
												>
													<ChevronDown className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="end"
												className="w-64 border-2 border-border bg-card shadow-hard"
											>
												<DropdownMenuItem
													onClick={() => void handleMarkSelfShipped()}
													className="py-2.5"
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
			)}

			{/* Batch error dialog */}
			<Dialog
				open={batchFailed !== null && batchFailed.length > 0}
				onOpenChange={(open) => {
					if (!open) setBatchFailed(null);
				}}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto border-2 border-border bg-card shadow-hard sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="font-heading text-lg">
							Илгээж чадсангүй
						</DialogTitle>
					</DialogHeader>
					<ul className="space-y-2 text-sm">
						{batchFailed?.map((failure) => (
							<li
								key={failure.targetId}
								className="border-2 border-border bg-muted px-3 py-2"
							>
								<span className="font-bold">#{failure.targetLabel}</span>
								<p className="mt-0.5 text-muted-foreground text-xs">
									{batchFailureDescription(failure)}
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
