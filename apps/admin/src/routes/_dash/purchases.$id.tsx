import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Pencil, Receipt, Trash2, Truck, X } from "lucide-react";
import { type ChangeEvent, type FormEvent, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { invalidatePurchaseLists } from "@/components/purchase/invalidate-purchase-lists";
import PurchaseForm from "@/components/purchase/purchase-form";
import { FormPageSkeleton } from "@/components/skeletons/admin-page-skeletons";
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
import { purchaseStatusLabel } from "@/lib/enum-labels";
import { formatCurrency, formatDateToText } from "@/lib/utils";
import { trpc } from "@/utils/trpc";

const purchaseProviderLabel: Record<string, string> = {
	amazon: "Amazon",
	iherb: "iHerb",
	naturebell: "Naturebell",
	unknown: "Тодорхойгүй",
};

export const Route = createFileRoute("/_dash/purchases/$id")({
	component: RouteComponent,
	loader: ({ context: ctx, params }) => {
		const id = Number(params.id);
		void ctx.queryClient.prefetchQuery(ctx.trpc.purchase.getPurchaseById.queryOptions({ id }));
		void ctx.queryClient.prefetchQuery(ctx.trpc.product.getAllProducts.queryOptions());
	},
	pendingComponent: FormPageSkeleton,
});

function RouteComponent() {
	return (
		<Suspense fallback={<FormPageSkeleton />}>
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
		queryClient.invalidateQueries(trpc.purchase.getPurchaseById.queryOptions({ id: purchaseId }));
		void invalidatePurchaseLists(queryClient);
	};

	const receiveMutation = useMutation({
		...trpc.purchase.receivePurchase.mutationOptions(),
		onError: (error) => toast.error(error.message),
		onSuccess: () => {
			invalidatePurchase();
			setReceiveAt("");
			setReceiveNotes("");
			setReceiveItems({});
			toast.success("Хүлээн авалт хадгалагдлаа");
		},
	});

	const markShippedMutation = useMutation({
		...trpc.purchase.markPurchaseShipped.mutationOptions(),
		onError: (error) => toast.error(error.message),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Илгээгдсэн гэж тэмдэглэлээ");
		},
	});

	const markForwarderMutation = useMutation({
		...trpc.purchase.markPurchaseForwarderReceived.mutationOptions(),
		onError: (error) => toast.error(error.message),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Зуучлагч хүлээн авсан гэж тэмдэглэлээ");
		},
	});

	const cancelMutation = useMutation({
		...trpc.purchase.cancelPurchase.mutationOptions(),
		onError: (error) => toast.error(error.message),
		onSuccess: () => {
			invalidatePurchase();
			toast.success("Худалдан авалт цуцлагдлаа");
		},
	});

	const deleteMutation = useMutation({
		...trpc.purchase.deletePurchase.mutationOptions(),
		onError: (error) => toast.error(error.message),
		onSuccess: () => {
			void invalidatePurchaseLists(queryClient);
			toast.success("Худалдан авалт устгагдлаа");
			navigate({ to: "/purchases" });
		},
	});

	const receivableItems = useMemo(
		() => (purchase ? purchase.items.filter((item) => item.quantityRemaining > 0) : []),
		[purchase],
	);

	if (!purchase) {
		return <div className="p-6">Худалдан авалт олдсонгүй.</div>;
	}

	return (
		<>
			<Dialog onOpenChange={setIsEditOpen} open={isEditOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[960px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Худалдан авалт засах</DialogTitle>
						<DialogDescription>
							Нийлүүлэгчийн худалдан авалтын мэдээлэл болон барааны мөрүүдийг шинэчлэх.
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-4 sm:p-6">
						<PurchaseForm onSuccess={() => setIsEditOpen(false)} purchase={purchase} />
					</div>
				</DialogContent>
			</Dialog>

			<div className="space-y-6 p-2 sm:p-6">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-3">
						<Button onClick={() => navigate({ to: "/purchases" })} type="button" variant="outline">
							<ArrowLeft className="h-4 w-4" />
						</Button>
						<div>
							<h1 className="font-heading text-2xl">{purchase.externalOrderNumber}</h1>
							<p className="text-muted-foreground text-sm">
								{purchaseProviderLabel[purchase.provider] ?? purchase.provider} ·{" "}
								{purchaseStatusLabel[purchase.status]}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<Button onClick={() => setIsEditOpen(true)} type="button" variant="outline">
							<Pencil className="mr-2 h-4 w-4" />
							Засах
						</Button>
						<Button
							onClick={() =>
								markShippedMutation.mutate({
									id: purchase.id,
									shippedAt: new Date(),
								})
							}
							type="button"
							variant="outline"
						>
							<Truck className="mr-2 h-4 w-4" />
							Илгээгдсэн
						</Button>
						<Button
							onClick={() =>
								markForwarderMutation.mutate({
									forwarderReceivedAt: new Date(),
									id: purchase.id,
								})
							}
							type="button"
							variant="outline"
						>
							<Receipt className="mr-2 h-4 w-4" />
							Зуучлагч хүлээн авсан
						</Button>
						<Button
							onClick={() => cancelMutation.mutate({ id: purchase.id })}
							type="button"
							variant="outline"
						>
							<X className="mr-2 h-4 w-4" />
							Цуцлах
						</Button>
						<Button
							onClick={() => deleteMutation.mutate({ id: purchase.id })}
							type="button"
							variant="outline"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Устгах
						</Button>
					</div>
				</div>

				<div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
					<div className="space-y-6">
						<section className="rounded-base border-border bg-card shadow-shadow border-2 p-5">
							<h2 className="font-heading text-lg">Худалдан авалтын мэдээлэл</h2>
							<div className="mt-4 grid gap-3 sm:grid-cols-2">
								<SummaryRow
									label="Нийлүүлэгч"
									value={purchaseProviderLabel[purchase.provider] ?? purchase.provider}
								/>
								<SummaryRow label="Трек код" value={purchase.trackingNumber || "Байхгүй"} />
								<SummaryRow
									label="Захиалсан"
									value={purchase.orderedAt ? formatDateToText(purchase.orderedAt) : "Оруулаагүй"}
								/>
								<SummaryRow
									label="Илгээгдсэн"
									value={purchase.shippedAt ? formatDateToText(purchase.shippedAt) : "Оруулаагүй"}
								/>
								<SummaryRow
									label="Зуучлагч"
									value={
										purchase.forwarderReceivedAt
											? formatDateToText(purchase.forwarderReceivedAt)
											: "Оруулаагүй"
									}
								/>
								<SummaryRow
									label="Хүлээн авсан"
									value={
										purchase.receivedAt ? formatDateToText(purchase.receivedAt) : "Хүлээгдэж буй"
									}
								/>
								<SummaryRow
									label="Хүргэлтийн зардал"
									value={formatCurrency(purchase.shippingCost)}
								/>
								<SummaryRow label="Нийт өртөг" value={formatCurrency(purchase.totalCost)} />
							</div>
							{purchase.notes ? (
								<div className="rounded-base bg-muted/30 mt-4 border p-3 text-sm">
									{purchase.notes}
								</div>
							) : null}
						</section>

						<section className="rounded-base border-border bg-card shadow-shadow border-2 p-5">
							<h2 className="font-heading text-lg">Бараа</h2>
							<div className="mt-4 space-y-3">
								{purchase.items.map((item) => (
									<div
										className="rounded-base grid gap-2 border p-4 sm:grid-cols-[2fr_1fr_1fr_1fr]"
										key={item.id}
									>
										<div>
											<p className="font-medium">{item.product.name}</p>
											<p className="text-muted-foreground text-sm">
												Нэгжийн өртөг: {formatCurrency(item.unitCost)}
											</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Захиалсан</p>
											<p>{item.quantityOrdered}</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Хүлээн авсан</p>
											<p>{item.quantityReceived}</p>
										</div>
										<div className="text-sm">
											<p className="text-muted-foreground">Үлдэгдэл</p>
											<p>{item.quantityRemaining}</p>
										</div>
									</div>
								))}
							</div>
						</section>

						<section className="rounded-base border-border bg-card shadow-shadow border-2 p-5">
							<h2 className="font-heading text-lg">Хүлээн авалтын түүх</h2>
							<div className="mt-4 space-y-3">
								{purchase.receipts.length === 0 ? (
									<p className="text-muted-foreground text-sm">Одоогоор хүлээн авалт байхгүй.</p>
								) : (
									purchase.receipts.map((receipt) => (
										<div className="rounded-base border p-4" key={receipt.id}>
											<div className="flex items-center justify-between">
												<p className="font-medium">{formatDateToText(receipt.receivedAt)}</p>
												<p className="text-muted-foreground text-sm">{receipt.items.length} мөр</p>
											</div>
											{receipt.notes ? (
												<p className="text-muted-foreground mt-2 text-sm">{receipt.notes}</p>
											) : null}
											<div className="mt-3 space-y-2 text-sm">
												{receipt.items.map((item) => (
													<div className="flex items-center justify-between" key={item.id}>
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

					<section className="rounded-base border-border bg-card shadow-shadow border-2 p-5">
						<h2 className="font-heading text-lg">Бараа хүлээн авах</h2>
						<p className="text-muted-foreground mt-1 text-sm">
							Зөвхөн танд ирсэн тоо хэмжээгээр нөөцөд нэмнэ үү.
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
									toast.error("Хүлээн авсан огноо болон дор хаяж нэг тоо хэмжээ оруулна уу");
									return;
								}

								receiveMutation.mutate({
									items,
									notes: receiveNotes || null,
									purchaseId,
									receivedAt: new Date(receiveAt),
								});
							}}
						>
							<div className="space-y-2">
								<Label htmlFor="receiveAt">Хүлээн авсан огноо</Label>
								<Input
									id="receiveAt"
									onChange={(event) => setReceiveAt(event.target.value)}
									type="datetime-local"
									value={receiveAt}
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="receiveNotes">Хүлээн авалтын тэмдэглэл</Label>
								<Textarea
									id="receiveNotes"
									onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
										setReceiveNotes(event.target.value)
									}
									rows={3}
									value={receiveNotes}
								/>
							</div>

							<div className="space-y-3">
								{receivableItems.length === 0 ? (
									<p className="text-muted-foreground text-sm">Бүх бараа хүлээн авагдсан байна.</p>
								) : (
									receivableItems.map((item) => (
										<div className="rounded-base border p-3" key={item.id}>
											<div className="flex items-center justify-between gap-4">
												<div>
													<p className="font-medium">{item.product.name}</p>
													<p className="text-muted-foreground text-sm">
														Үлдэгдэл: {item.quantityRemaining}
													</p>
												</div>
												<Input
													className="max-w-24"
													max={item.quantityRemaining}
													min={0}
													onChange={(event) =>
														setReceiveItems((current) => ({
															...current,
															[item.id]: Number(event.target.value),
														}))
													}
													type="number"
													value={receiveItems[item.id] ?? 0}
												/>
											</div>
										</div>
									))
								)}
							</div>

							<Button
								className="gap-2"
								disabled={receiveMutation.isPending || receivableItems.length === 0}
								type="submit"
							>
								{receiveMutation.isPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Receipt className="h-4 w-4" />
								)}
								Хүлээн авалт хадгалах
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
