import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	Loader2,
	Pencil,
	Receipt,
	Trash2,
	Truck,
	X,
} from "lucide-react";
import {
	type ChangeEvent,
	Suspense,
	type FormEvent,
	useMemo,
	useState,
} from "react";
import { toast } from "sonner";
import PurchaseForm from "@/components/purchase/purchase-form";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/purchases/$id")({
	component: RouteComponent,
	loader: async ({ context: ctx, params }) => {
		const id = Number(params.id);
		await Promise.all([
			ctx.queryClient.ensureQueryData(
				ctx.trpc.purchase.getPurchaseById.queryOptions({ id }),
			),
			ctx.queryClient.ensureQueryData(
				ctx.trpc.product.getAllProducts.queryOptions(),
			),
		]);
	},
});

function RouteComponent() {
	return (
		<Suspense fallback={<div className="p-6">Loading purchase...</div>}>
			<PurchaseDetailPage />
		</Suspense>
	);
}

function PurchaseDetailPage() {
	const { id } = Route.useParams();
	const purchaseId = Number(id);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [isEditOpen, setIsEditOpen] = useState(false);
	const [receiveAt, setReceiveAt] = useState("");
	const [receiveNotes, setReceiveNotes] = useState("");
	const [receiveItems, setReceiveItems] = useState<Record<number, number>>({});

	const { data: purchase } = useSuspenseQuery(
		trpc.purchase.getPurchaseById.queryOptions({ id: purchaseId }),
	);

	const invalidatePurchase = () => {
		queryClient.invalidateQueries(
			trpc.purchase.getPurchaseById.queryOptions({ id: purchaseId }),
		);
		queryClient.invalidateQueries(
			trpc.purchase.getPaginatedPurchases.queryOptions({
				page: 1,
				pageSize: 10,
				sortDirection: "desc",
			}),
		);
	};

	const receiveMutation = useMutation({
		...trpc.purchase.receivePurchase.mutationOptions(),
		onSuccess: () => {
			invalidatePurchase();
			setReceiveAt("");
			setReceiveNotes("");
			setReceiveItems({});
			toast.success("Receipt saved");
		},
		onError: (error) => toast.error(error.message),
	});

	const markShippedMutation = useMutation({
		...trpc.purchase.markPurchaseShipped.mutationOptions(),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Marked as shipped");
		},
		onError: (error) => toast.error(error.message),
	});

	const markForwarderMutation = useMutation({
		...trpc.purchase.markPurchaseForwarderReceived.mutationOptions(),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Marked as received by forwarder");
		},
		onError: (error) => toast.error(error.message),
	});

	const cancelMutation = useMutation({
		...trpc.purchase.cancelPurchase.mutationOptions(),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Purchase cancelled");
		},
		onError: (error) => toast.error(error.message),
	});

	const deleteMutation = useMutation({
		...trpc.purchase.deletePurchase.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.purchase.getPaginatedPurchases.queryOptions({
					page: 1,
					pageSize: 10,
					sortDirection: "desc",
				}),
			);
			toast.success("Purchase deleted");
			navigate({ to: "/purchases" });
		},
		onError: (error) => toast.error(error.message),
	});

	const receivableItems = useMemo(
		() => (purchase ? purchase.items.filter((item) => item.quantityRemaining > 0) : []),
		[purchase],
	);

	if (!purchase) {
		return <div className="p-6">Purchase not found.</div>;
	}

	return (
		<>
			<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[960px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Edit purchase</DialogTitle>
						<DialogDescription>
							Update supplier purchase details and line items.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-4 sm:p-6">
						<PurchaseForm
							purchase={purchase}
							onSuccess={() => {
								setIsEditOpen(false);
								invalidatePurchase();
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<div className="space-y-6 p-2 sm:p-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate({ to: "/purchases" })}
						>
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="font-heading text-2xl">
								{purchase.externalOrderNumber}
							</h1>
							<p className="text-muted-foreground text-sm">
								{purchase.provider} · {purchase.status.replaceAll("_", " ")}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setIsEditOpen(true)}
						>
							<Pencil className="mr-2 h-4 w-4" />
							Edit
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								markShippedMutation.mutate({
									id: purchase.id,
									shippedAt: new Date(),
								})
							}
						>
							<Truck className="mr-2 h-4 w-4" />
							Mark shipped
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								markForwarderMutation.mutate({
									id: purchase.id,
									forwarderReceivedAt: new Date(),
								})
							}
						>
							<Receipt className="mr-2 h-4 w-4" />
							Forwarder received
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => cancelMutation.mutate({ id: purchase.id })}
						>
							<X className="mr-2 h-4 w-4" />
							Cancel
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => deleteMutation.mutate({ id: purchase.id })}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete
						</Button>
					</div>
				</div>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<div className="space-y-6">
						<section className="rounded-base border-2 border-border bg-card p-5 shadow-shadow">
							<h2 className="font-heading text-lg">Purchase Summary</h2>
							<div className="mt-4 grid gap-3 sm:grid-cols-2">
								<SummaryRow label="Provider" value={purchase.provider} />
								<SummaryRow
									label="Tracking"
									value={purchase.trackingNumber || "N/A"}
								/>
								<SummaryRow
									label="Ordered"
									value={
										purchase.orderedAt
											? formatDateToText(purchase.orderedAt)
											: "Not set"
									}
								/>
								<SummaryRow
									label="Shipped"
									value={
										purchase.shippedAt
											? formatDateToText(purchase.shippedAt)
											: "Not set"
									}
								/>
								<SummaryRow
									label="Forwarder"
									value={
										purchase.forwarderReceivedAt
											? formatDateToText(purchase.forwarderReceivedAt)
											: "Not set"
									}
								/>
								<SummaryRow
									label="Received"
									value={
										purchase.receivedAt
											? formatDateToText(purchase.receivedAt)
											: "Pending"
									}
								/>
								<SummaryRow
									label="Shipping"
									value={formatCurrency(purchase.shippingCost)}
								/>
								<SummaryRow
									label="Total cost"
									value={formatCurrency(purchase.totalCost)}
								/>
							</div>
							{purchase.notes ? (
								<div className="mt-4 rounded-base border bg-muted/30 p-3 text-sm">
									{purchase.notes}
								</div>
							) : null}
						</section>

						<section className="rounded-base border-2 border-border bg-card p-5 shadow-shadow">
							<h2 className="font-heading text-lg">Items</h2>
							<div className="mt-4 space-y-3">
								{purchase.items.map((item) => (
									<div
										key={item.id}
										className="grid gap-2 rounded-base border p-4 sm:grid-cols-[2fr_1fr_1fr_1fr]"
									>
										<div>
											<p className="font-medium">{item.product.name}</p>
											<p className="text-muted-foreground text-sm">
												Unit cost: {formatCurrency(item.unitCost)}
											</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Ordered</p>
											<p>{item.quantityOrdered}</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Received</p>
											<p>{item.quantityReceived}</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Remaining</p>
											<p>{item.quantityRemaining}</p>
										</div>
									</div>
								))}
							</div>
						</section>

						<section className="rounded-base border-2 border-border bg-card p-5 shadow-shadow">
							<h2 className="font-heading text-lg">Receipt History</h2>
							<div className="mt-4 space-y-3">
								{purchase.receipts.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										No receipts yet.
									</p>
								) : (
									purchase.receipts.map((receipt) => (
										<div key={receipt.id} className="rounded-base border p-4">
											<div className="flex items-center justify-between">
												<p className="font-medium">
													{formatDateToText(receipt.receivedAt)}
												</p>
												<p className="text-muted-foreground text-sm">
													{receipt.items.length} lines
												</p>
											</div>
											{receipt.notes ? (
												<p className="mt-2 text-muted-foreground text-sm">
													{receipt.notes}
												</p>
											) : null}
											<div className="mt-3 space-y-2 text-sm">
												{receipt.items.map((item) => (
													<div
														key={item.id}
														className="flex items-center justify-between"
													>
														<span>{item.productName}</span>
														<span>+{item.quantityReceived}</span>
													</div>
												))}
											</div>
										</div>
									))
								)}
							</div>
						</section>
					</div>

					<section className="rounded-base border-2 border-border bg-card p-5 shadow-shadow">
						<h2 className="font-heading text-lg">Receive Items</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Add stock only for the quantities that arrived to you.
						</p>

						<form
							className="mt-4 space-y-4"
							onSubmit={(event: FormEvent<HTMLFormElement>) => {
								event.preventDefault();
								const items = receivableItems
									.map((item) => ({
										purchaseItemId: item.id,
										quantityReceived: Number(receiveItems[item.id] ?? 0),
									}))
									.filter((item) => item.quantityReceived > 0);

								if (!receiveAt || items.length === 0) {
									toast.error("Set a receive date and at least one quantity");
									return;
								}

								receiveMutation.mutate({
									purchaseId,
									receivedAt: new Date(receiveAt),
									notes: receiveNotes || null,
									items,
								});
							}}
						>
							<div className="space-y-2">
								<Label htmlFor="receiveAt">Received at</Label>
								<Input
									id="receiveAt"
									type="datetime-local"
									value={receiveAt}
									onChange={(event) => setReceiveAt(event.target.value)}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="receiveNotes">Receipt notes</Label>
								<Textarea
									id="receiveNotes"
									value={receiveNotes}
									onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
										setReceiveNotes(event.target.value)
									}
									rows={3}
								/>
							</div>

							<div className="space-y-3">
								{receivableItems.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Everything has already been received.
									</p>
								) : (
									receivableItems.map((item) => (
										<div key={item.id} className="rounded-base border p-3">
											<div className="flex items-center justify-between gap-4">
												<div>
													<p className="font-medium">{item.product.name}</p>
													<p className="text-muted-foreground text-sm">
														Remaining: {item.quantityRemaining}
													</p>
												</div>
												<Input
													type="number"
													min={0}
													max={item.quantityRemaining}
													value={receiveItems[item.id] ?? 0}
													onChange={(event) =>
														setReceiveItems((current) => ({
															...current,
															[item.id]: Number(event.target.value),
														}))
													}
													className="max-w-24"
												/>
											</div>
										</div>
									))
								)}
							</div>

							<Button
								type="submit"
								disabled={
									receiveMutation.isPending || receivableItems.length === 0
								}
								className="gap-2"
							>
								{receiveMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Receipt className="h-4 w-4" />
								)}
								Save receipt
							</Button>
						</form>
					</section>
				</div>
			</div>
		</>
	);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-base border p-3">
			<p className="text-muted-foreground text-xs uppercase">{label}</p>
			<p className="mt-1 font-medium">{value}</p>
		</div>
	);
}
