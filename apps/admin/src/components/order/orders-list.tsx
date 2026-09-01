import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { mutationErrorMessage } from "@/lib/mutation-error";
import { parsePicklistValue } from "@/lib/parse-select";
import { trpc } from "@/utils/trpc";
import BatchShipOrderDialog, { type BatchShipResult } from "./batch-ship-order-dialog";
import OrderCard from "./order-card";

const activeOrderStatuses = ["created", "pending", "shipped"] as const;

interface OrdersListProps {
	date?: string;
	orderStatus?: string;
	page: number;
	pageSize: number;
	paymentStatus?: string;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
}

export default function OrdersList({
	date,
	orderStatus,
	page,
	pageSize,
	paymentStatus,
	searchTerm,
	sortDirection,
	sortField,
}: OrdersListProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: "/orders" });
	const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
	const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
	const [batchFailed, setBatchFailed] = useState<Array<{
		message: string;
		orderNumber: string;
	}> | null>(null);
	const [isBatchUpdating, setIsBatchUpdating] = useState(false);

	const { data: ordersData } = useSuspenseQuery({
		...trpc.order.getPaginatedOrders.queryOptions({
			date,
			includeAllStatuses: orderStatus === "all",
			orderStatus:
				orderStatus === "all" || orderStatus === "active"
					? undefined
					: parsePicklistValue(orderStatusConstants, orderStatus ?? ""),
			orderStatuses: orderStatus === "active" ? [...activeOrderStatuses] : undefined,
			page,
			pageSize,
			paymentStatus: paymentStatus
				? parsePicklistValue(paymentStatusConstants, paymentStatus)
				: undefined,
			searchTerm,
			sortDirection,
			sortField,
		}),
		refetchInterval: 60_000,
		refetchOnWindowFocus: true,
	});
	const orders = ordersData.orders;
	const pagination = ordersData.pagination;

	const pendingOnPage = orders.filter((o) => o.status === "pending");
	const selectedPendingOrders = pendingOnPage.filter((order) => selectedIds.has(order.id));
	const allPendingSelected =
		pendingOnPage.length > 0 && pendingOnPage.every((o) => selectedIds.has(o.id));

	useEffect(() => {
		setSelectedIds(new Set());
		setIsBatchDialogOpen(false);
	}, [page, pageSize, orderStatus, paymentStatus, date, searchTerm, sortField, sortDirection]);

	useEffect(() => {
		const pendingIds = new Set(
			orders.filter((order) => order.status === "pending").map((order) => order.id),
		);
		setSelectedIds((current) => {
			const next = new Set([...current].filter((id) => pendingIds.has(id)));
			return next.size === current.size ? current : next;
		});
	}, [orders]);

	const updateStatusMutation = useMutation({
		...trpc.order.updateOrderStatus.mutationOptions(),
		// Failures are summarized in the batch dialog; a no-op onError keeps
		// the global MutationCache from toasting once per failed order too.
		onError: () => {},
	});

	const handlePageChange = (nextPage: number) => {
		navigate({
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
			to: "/orders",
		});
	};

	const clearSelection = () => {
		setSelectedIds(new Set());
		setIsBatchDialogOpen(false);
	};

	const toggleSelectAllPending = () => {
		setSelectedIds(
			allPendingSelected ? new Set() : new Set(pendingOnPage.map((order) => order.id)),
		);
	};

	const handleBatchShipComplete = async ({ failed, total }: BatchShipResult) => {
		await queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());

		const okCount = total - failed.length;
		if (failed.length === 0) {
			clearSelection();
			toast.success(`${okCount} захиалгыг TU руу илгээлээ`);
			return;
		}

		setSelectedIds(new Set(failed.map((row) => row.orderId)));
		setBatchFailed(failed.map(({ message, orderNumber }) => ({ message, orderNumber })));
		if (okCount === 0) {
			toast.error("Илгээлт амжилтгүй");
		} else {
			toast.warning(`${okCount} амжилттай, ${failed.length} алдаатай`);
		}
	};

	const handleMarkSelfShipped = async () => {
		if (selectedIds.size === 0) {
			return;
		}
		setIsBatchUpdating(true);
		const ids = [...selectedIds];
		const failed: Array<{ message: string; orderNumber: string }> = [];
		await Promise.all(
			ids.map(async (id) => {
				const order = orders.find((o) => o.id === id);
				try {
					await updateStatusMutation.mutateAsync({ id, status: "shipped" });
				} catch (error) {
					failed.push({
						message: error instanceof Error ? mutationErrorMessage(error) : "Алдаа гарлаа",
						orderNumber: order?.orderNumber ?? String(id),
					});
				}
			}),
		);
		await queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
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
				<div className="border-border bg-card shadow-hard-sm flex items-center gap-3 border-2 px-4 py-3">
					<label
						className="flex cursor-pointer items-center gap-3 text-sm select-none"
						htmlFor="select-all-pending-orders"
					>
						<Checkbox
							aria-label="Энэ хуудсан дээрх бүх хүлээгдэж буй захиалгыг сонгох"
							checked={allPendingSelected}
							className="h-5 w-5"
							id="select-all-pending-orders"
							onCheckedChange={() => toggleSelectAllPending()}
						/>
						<span className="text-muted-foreground">
							Хүлээгдэж буй{" "}
							<span className="text-foreground font-bold">{pendingOnPage.length}</span> сонгох
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
												if (checked) {
													next.add(order.id);
												} else {
													next.delete(order.id);
												}
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
				<div className="border-border flex flex-col items-center justify-center border-2 border-dashed py-16">
					<Package className="text-muted-foreground mb-3 h-12 w-12" />
					<p className="font-heading text-lg font-bold">Захиалга олдсонгүй</p>
					<p className="text-muted-foreground mt-1 text-sm">
						Шүүлтүүр эсвэл хайлтаа өөрчлөөд дахин оролдоно уу
					</p>
				</div>
			)}

			{/* Pagination */}
			{orders.length > 0 && (
				<div className="pt-4">
					<DataPagination
						currentPage={pagination.currentPage}
						itemsPerPage={pageSize}
						onPageChange={handlePageChange}
						totalItems={pagination.totalCount}
					/>
				</div>
			)}

			{/* Batch toolbar */}
			{toolbarOpen && (
				<>
					<div
						aria-hidden
						className="h-[calc(5.25rem+env(safe-area-inset-bottom,0px))] shrink-0 sm:hidden"
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
									<p className="font-heading text-sm font-bold">{selectedIds.size} сонгогдсон</p>
									<p className="text-muted-foreground text-xs">Зөвхөн хүлээгдэж буй захиалга</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<Button
										className="h-10"
										disabled={isBatchUpdating}
										onClick={clearSelection}
										size="sm"
										variant="ghost"
									>
										Цэвэрлэх
									</Button>
									<div className="flex">
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex">
													<Button
														className="border-border h-10 gap-2 rounded-r-none border-r-2"
														disabled={!canTuSend}
														onClick={() => setIsBatchDialogOpen(true)}
														size="sm"
													>
														{isBatchUpdating ? (
															<Loader2 className="h-4 w-4 animate-spin" />
														) : (
															<Truck className="h-4 w-4" />
														)}
														<span className="hidden sm:inline">TU руу илгээх</span>
														<span className="sm:hidden">Илгээх</span>
													</Button>
												</span>
											</TooltipTrigger>
											<TooltipContent
												className="hidden max-w-xs space-y-1 text-left text-xs sm:block"
												side="top"
											>
												<p className="font-bold">Үндсэн: TU API</p>
												<p className="text-muted-foreground">
													Ойрын хаягийг өөрөө авах бол «Өөрөөр хүргэсэн» сонгоно.
												</p>
											</TooltipContent>
										</Tooltip>
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													aria-label="Нэмэлт сонголт"
													className="h-10 rounded-l-none px-3"
													disabled={selectedIds.size === 0 || isBatchUpdating}
													size="sm"
												>
													<ChevronDown className="h-4 w-4" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="end"
												className="border-border bg-card shadow-hard w-64 border-2"
											>
												<DropdownMenuItem
													className="py-2.5"
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
			)}

			<BatchShipOrderDialog
				onComplete={handleBatchShipComplete}
				onOpenChange={setIsBatchDialogOpen}
				open={isBatchDialogOpen}
				orders={selectedPendingOrders}
			/>

			{/* Batch error dialog */}
			<Dialog
				onOpenChange={(open) => {
					if (!open) {
						setBatchFailed(null);
					}
				}}
				open={batchFailed !== null && batchFailed.length > 0}
			>
				<DialogContent className="border-border bg-card shadow-hard max-h-[85vh] overflow-y-auto border-2 sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="font-heading text-lg">Илгээж чадсангүй</DialogTitle>
					</DialogHeader>
					<ul className="space-y-2 text-sm">
						{batchFailed?.map((row) => (
							<li className="border-border bg-muted border-2 px-3 py-2" key={row.orderNumber}>
								<span className="font-bold">#{row.orderNumber}</span>
								<p className="text-muted-foreground mt-0.5 text-xs">{row.message}</p>
							</li>
						))}
					</ul>
					<DialogFooter>
						<Button onClick={() => setBatchFailed(null)} variant="secondary">
							Хаах
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
