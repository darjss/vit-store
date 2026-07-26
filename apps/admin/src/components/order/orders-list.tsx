import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type {
	orderStatus as orderStatusConstants,
	paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import { ChevronDown, Loader2, Package, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { trpc } from "@/utils/trpc";
import BatchShipOrderDialog, {
	type BatchShipResult,
} from "./batch-ship-order-dialog";
import OrderCard from "./order-card";

const activeOrderStatuses = ["created", "pending", "shipped"] as const;

function trpcErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Алдаа гарлаа";
}

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
	const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
	const [batchFailed, setBatchFailed] = useState<
		{ orderNumber: string; message: string }[] | null
	>(null);
	const [isBatchUpdating, setIsBatchUpdating] = useState(false);

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
	const selectedPendingOrders = pendingOnPage.filter((order) =>
		selectedIds.has(order.id),
	);
	const allPendingSelected =
		pendingOnPage.length > 0 &&
		pendingOnPage.every((o) => selectedIds.has(o.id));

	useEffect(() => {
		setSelectedIds(new Set());
		setIsBatchDialogOpen(false);
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

	const clearSelection = () => {
		setSelectedIds(new Set());
		setIsBatchDialogOpen(false);
	};

	const toggleSelectAllPending = () => {
		setSelectedIds(
			allPendingSelected
				? new Set()
				: new Set(pendingOnPage.map((order) => order.id)),
		);
	};

	const handleBatchShipComplete = async ({
		total,
		failed,
	}: BatchShipResult) => {
		await queryClient.invalidateQueries(
			trpc.order.getPaginatedOrders.queryOptions({}),
		);

		const okCount = total - failed.length;
		if (failed.length === 0) {
			clearSelection();
			toast.success(`${okCount} захиалгыг TU руу илгээлээ`);
			return;
		}

		setSelectedIds(new Set(failed.map((row) => row.orderId)));
		setBatchFailed(
			failed.map(({ orderNumber, message }) => ({ orderNumber, message })),
		);
		if (okCount === 0) {
			toast.error("Илгээлт амжилтгүй");
		} else {
			toast.warning(`${okCount} амжилттай, ${failed.length} алдаатай`);
		}
	};

	const handleMarkSelfShipped = async () => {
		if (selectedIds.size === 0) return;
		setIsBatchUpdating(true);
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
		await queryClient.invalidateQueries(
			trpc.order.getPaginatedOrders.queryOptions({}),
		);
		clearSelection();
		setIsBatchUpdating(false);

		if (failed.length === 0) {
			toast.success("Сонгосон захиалгыг илгээсэн гэж тэмдэглэлээ");
		} else {
			toast.error("Зарим захиалгыг шинэчилж чадсангүй");
			setBatchFailed(failed);
		}
	};

	const canTuSend = selectedIds.size > 0 && !isBatchUpdating;
	const toolbarOpen = selectedIds.size > 0;

	return (
		<>
			{/* Batch select header */}
			{pendingOnPage.length > 0 && (
				<div className="flex items-center gap-3 border-2 border-border bg-card px-4 py-3 shadow-hard-sm">
					<label
						htmlFor="select-all-pending-orders"
						className="flex cursor-pointer select-none items-center gap-3 text-sm"
					>
						<Checkbox
							id="select-all-pending-orders"
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
				<div className="flex flex-col items-center justify-center border-2 border-border border-dashed py-16">
					<Package className="mb-3 h-12 w-12 text-muted-foreground" />
					<p className="font-bold font-heading text-lg">Захиалга олдсонгүй</p>
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
								"fixed z-40 border-border border-t-2 bg-card/95 backdrop-blur-md",
								"inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom,0px)]",
								"shadow-[0_-8px_28px_rgba(0,0,0,0.08)]",
								"sm:-translate-x-1/2 sm:inset-x-auto sm:bottom-5 sm:left-1/2 sm:w-[min(100%-2rem,28rem)]",
								"sm:rounded-none sm:border-2 sm:shadow-hard",
							].join(" ")}
						>
							<div className="flex items-center justify-between gap-4 px-4 py-3">
								<div className="min-w-0">
									<p className="font-bold font-heading text-sm">
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
										disabled={isBatchUpdating}
										onClick={clearSelection}
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
														className="h-10 gap-2 rounded-r-none border-border border-r-2"
														disabled={!canTuSend}
														onClick={() => setIsBatchDialogOpen(true)}
													>
														{isBatchUpdating ? (
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
													disabled={selectedIds.size === 0 || isBatchUpdating}
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

			<BatchShipOrderDialog
				open={isBatchDialogOpen}
				orders={selectedPendingOrders}
				onOpenChange={setIsBatchDialogOpen}
				onComplete={handleBatchShipComplete}
			/>

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
						{batchFailed?.map((row) => (
							<li
								key={row.orderNumber}
								className="border-2 border-border bg-muted px-3 py-2"
							>
								<span className="font-bold">#{row.orderNumber}</span>
								<p className="mt-0.5 text-muted-foreground text-xs">
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
