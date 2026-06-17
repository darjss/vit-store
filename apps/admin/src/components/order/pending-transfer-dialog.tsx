import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle, Loader2, Phone, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

interface PendingTransferDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function invalidateTransferQueries(queryClient: ReturnType<typeof useQueryClient>) {
	void queryClient.invalidateQueries({
		queryKey: trpc.payment.getClaimedTransferCount.queryKey(),
	});
	void queryClient.invalidateQueries({
		queryKey: trpc.payment.getClaimedTransferPayments.queryKey(),
	});
	void queryClient.invalidateQueries({
		queryKey: trpc.order.getPaginatedOrders.queryKey(),
	});
	void queryClient.invalidateQueries({
		queryKey: trpc.order.getOrderById.queryKey(),
	});
}

export function TransferPaymentActions({
	paymentNumber,
	size = "sm",
	onSuccess,
}: {
	paymentNumber: string;
	size?: "sm" | "default";
	onSuccess?: () => void;
}) {
	const queryClient = useQueryClient();

	const confirmTransfer = useMutation(
		trpc.payment.confirmTransferPayment.mutationOptions({
			onSuccess: () => {
				invalidateTransferQueries(queryClient);
				toast.success("Төлбөр баталгаажлаа");
				onSuccess?.();
			},
			onError: (error) => {
				toast.error(error.message || "Төлбөр баталгаажуулахад алдаа гарлаа");
			},
		}),
	);

	const rejectTransfer = useMutation(
		trpc.payment.rejectTransferPayment.mutationOptions({
			onSuccess: () => {
				invalidateTransferQueries(queryClient);
				toast.success("Төлбөр татгалзлаа");
				onSuccess?.();
			},
			onError: (error) => {
				toast.error(error.message || "Төлбөр татгалзахад алдаа гарлаа");
			},
		}),
	);

	const isPending = confirmTransfer.isPending || rejectTransfer.isPending;

	return (
		<div className="flex flex-wrap gap-2">
			<Button
				size={size}
				className="gap-1.5"
				disabled={isPending}
				onClick={() => confirmTransfer.mutate({ paymentNumber })}
			>
				{confirmTransfer.isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<CheckCircle className="h-3.5 w-3.5" />
				)}
				Батлах
			</Button>
			<Button
				size={size}
				variant="outline"
				className="gap-1.5"
				disabled={isPending}
				onClick={() => rejectTransfer.mutate({ paymentNumber })}
			>
				{rejectTransfer.isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					<XCircle className="h-3.5 w-3.5" />
				)}
				Татгалзах
			</Button>
		</div>
	);
}

export default function PendingTransferDialog({
	open,
	onOpenChange,
}: PendingTransferDialogProps) {
	const queryClient = useQueryClient();
	const claimedTransfers = useQuery({
		...trpc.payment.getClaimedTransferPayments.queryOptions(),
		enabled: open,
	});

	const confirmTransfer = useMutation(
		trpc.payment.confirmTransferPayment.mutationOptions({
			onSuccess: () => {
				invalidateTransferQueries(queryClient);
				toast.success("Төлбөр баталгаажлаа");
			},
			onError: (error) => {
				toast.error(error.message || "Төлбөр баталгаажуулахад алдаа гарлаа");
			},
		}),
	);

	const rejectTransfer = useMutation(
		trpc.payment.rejectTransferPayment.mutationOptions({
			onSuccess: () => {
				invalidateTransferQueries(queryClient);
				toast.success("Төлбөр татгалзлаа");
			},
			onError: (error) => {
				toast.error(error.message || "Төлбөр татгалзахад алдаа гарлаа");
			},
		}),
	);

	const pendingPaymentNumber =
		confirmTransfer.variables?.paymentNumber ??
		rejectTransfer.variables?.paymentNumber;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[85vh] max-w-[95vw] overflow-hidden border-2 border-border bg-card p-0 shadow-hard sm:max-w-2xl">
				<DialogHeader className="border-border border-b px-4 py-4 sm:px-6">
					<DialogTitle>Шилжүүлэг баталгаажуулах</DialogTitle>
					<DialogDescription>
						Хэрэглэгч төлсөн гэж мэдэгдсэн дансны шилжүүлгүүд
					</DialogDescription>
				</DialogHeader>

				<div className="max-h-[60vh] overflow-y-auto px-4 py-4 sm:px-6">
					{claimedTransfers.isLoading ? (
						<div className="flex items-center justify-center py-10 text-muted-foreground text-sm">
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Уншиж байна...
						</div>
					) : claimedTransfers.data?.length ? (
						<div className="space-y-3">
							{claimedTransfers.data.map((claim) => {
								const isRowPending =
									pendingPaymentNumber === claim.paymentNumber &&
									(confirmTransfer.isPending || rejectTransfer.isPending);

								return (
									<div
										key={claim.paymentNumber}
										className="border-2 border-border bg-background p-4 shadow-hard-sm"
									>
										<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
											<div className="min-w-0 space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<span className="font-heading font-black">
														#{claim.orderNumber}
													</span>
													<span className="text-muted-foreground text-xs">
														{new Date(
															claim.updatedAt ?? claim.createdAt,
														).toLocaleString("mn-MN")}
													</span>
												</div>
												<div className="flex items-center gap-1.5 text-sm">
													<Phone className="h-3.5 w-3.5 text-muted-foreground" />
													<span className="font-bold tabular-nums">
														{claim.customerPhone}
													</span>
												</div>
												<p className="font-heading text-lg font-black tabular-nums">
													{formatCurrency(claim.amount)}
												</p>
												<p className="text-muted-foreground text-xs">
													{claim.products.length} бараа ·{" "}
													{claim.products
														.slice(0, 2)
														.map((product) => product.name)
														.join(", ")}
													{claim.products.length > 2 ? "..." : ""}
												</p>
												<Link
													to="/orders/$id"
													params={{ id: claim.orderId.toString() }}
													className="inline-flex text-primary text-xs underline-offset-2 hover:underline"
													onClick={() => onOpenChange(false)}
												>
													Захиалга харах
												</Link>
											</div>

											<div className="flex shrink-0 gap-2">
												<Button
													size="sm"
													className="gap-1.5"
													disabled={isRowPending}
													onClick={() =>
														confirmTransfer.mutate({
															paymentNumber: claim.paymentNumber,
														})
													}
												>
													{confirmTransfer.isPending &&
													pendingPaymentNumber === claim.paymentNumber ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : (
														<CheckCircle className="h-3.5 w-3.5" />
													)}
													Батлах
												</Button>
												<Button
													size="sm"
													variant="outline"
													className="gap-1.5"
													disabled={isRowPending}
													onClick={() =>
														rejectTransfer.mutate({
															paymentNumber: claim.paymentNumber,
														})
													}
												>
													{rejectTransfer.isPending &&
													pendingPaymentNumber === claim.paymentNumber ? (
														<Loader2 className="h-3.5 w-3.5 animate-spin" />
													) : (
														<XCircle className="h-3.5 w-3.5" />
													)}
													Татгалзах
												</Button>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<p className="py-10 text-center text-muted-foreground text-sm">
							Одоогоор баталгаажуулах шилжүүлэг байхгүй байна.
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
