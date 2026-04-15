import {
	useMutation,
	useQueryClient,
	useSuspenseQueries,
} from "@tanstack/react-query";
import {
	Loader2,
	Plus,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { PurchaseDetailType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
	buildImportedPurchasePayload,
	buildPurchasePayload,
	EMPTY_LINE,
	getInitialPurchaseItems,
	hasUnresolvedAiItems,
	type PurchaseFormProps,
	type PurchaseLineState,
	toDateInputValue,
} from "./purchase-form.helpers";
import { PurchaseLineEditor } from "./purchase-line-editor";

export default function PurchaseForm({
	purchase,
	aiData,
	onSuccess,
	onResetAI,
}: PurchaseFormProps) {
	const queryClient = useQueryClient();
	const [{ data: products }, { data: categories }, { data: brands }] =
		useSuspenseQueries({
			queries: [
				trpc.product.getAllProducts.queryOptions(),
				trpc.category.getAllCategories.queryOptions(),
				trpc.brands.getAllBrands.queryOptions(),
			],
		});

	const [provider, setProvider] = useState(
		aiData?.header.provider ?? purchase?.provider ?? "amazon",
	);
	const [externalOrderNumber, setExternalOrderNumber] = useState(
		aiData?.header.externalOrderNumber ?? purchase?.externalOrderNumber ?? "",
	);
	const [trackingNumber, setTrackingNumber] = useState(
		aiData?.header.trackingNumber ?? purchase?.trackingNumber ?? "",
	);
	const [shippingCost, setShippingCost] = useState(
		aiData?.header.shippingCost ?? purchase?.shippingCost ?? 0,
	);
	const [notes, setNotes] = useState(
		aiData?.header.notes ?? purchase?.notes ?? "",
	);
	const [orderedAt, setOrderedAt] = useState(
		toDateInputValue(aiData?.header.orderedAt ?? purchase?.orderedAt),
	);
	const [shippedAt, setShippedAt] = useState(
		toDateInputValue(purchase?.shippedAt),
	);
	const [forwarderReceivedAt, setForwarderReceivedAt] = useState(
		toDateInputValue(purchase?.forwarderReceivedAt),
	);
	const [items, setItems] = useState<PurchaseLineState[]>(
		getInitialPurchaseItems({ aiData, purchase }),
	);

	useEffect(() => {
		if (!aiData) return;
		setProvider(aiData.header.provider);
		setExternalOrderNumber(aiData.header.externalOrderNumber ?? "");
		setTrackingNumber(aiData.header.trackingNumber ?? "");
		setShippingCost(aiData.header.shippingCost ?? 0);
		setNotes(aiData.header.notes ?? "");
		setOrderedAt(toDateInputValue(aiData.header.orderedAt));
		setItems(getInitialPurchaseItems({ aiData }));
	}, [aiData]);

	const subtotal = useMemo(
		() =>
			items.reduce(
				(sum, item) => sum + item.quantityOrdered * item.unitCost,
				0,
			),
		[items],
	);

	const handleMutationSuccess = (purchaseId: number) => {
		queryClient.invalidateQueries(
			trpc.purchase.getPaginatedPurchases.queryOptions({
				page: 1,
				pageSize: 10,
				sortDirection: "desc",
			}),
		);
		queryClient.invalidateQueries(trpc.purchase.getAllPurchases.queryOptions());
		queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		if (purchase) {
			queryClient.invalidateQueries(
				trpc.purchase.getPurchaseById.queryOptions({ id: purchase.id }),
			);
		}
		toast.success(
			purchase ? "Худалдан авалт шинэчлэгдлээ" : "Худалдан авалт хадгалагдлаа",
		);
		onSuccess?.(purchaseId);
	};

	const handleMutationError = (message: string) => {
		toast.error(message);
	};

	const createPurchaseMutation = useMutation({
		...trpc.purchase.addPurchase.mutationOptions(),
		onSuccess: (result) => handleMutationSuccess(result.id),
		onError: (error) => handleMutationError(error.message),
	});

	const updatePurchaseMutation = useMutation({
		...trpc.purchase.updatePurchase.mutationOptions(),
		onSuccess: () => {
			if (purchase) {
				handleMutationSuccess(purchase.id);
			}
		},
		onError: (error) => handleMutationError(error.message),
	});

	const importPurchaseMutation = useMutation({
		...trpc.aiPurchase.saveExtractedPurchase.mutationOptions(),
		onSuccess: (result) => handleMutationSuccess(result.id),
		onError: (error) => handleMutationError(error.message),
	});

	const isSubmitting =
		createPurchaseMutation.isPending ||
		updatePurchaseMutation.isPending ||
		importPurchaseMutation.isPending;

	const updateItem = (
		index: number,
		field: keyof PurchaseLineState,
		value: number | string | null | undefined,
	) => {
		setItems((current) =>
			current.map((item, itemIndex) =>
				itemIndex === index ? { ...item, [field]: value } : item,
			),
		);
	};

	const updateDraft = (
		index: number,
		field: keyof NonNullable<PurchaseLineState["newProductDraft"]>,
		value: string | number | null | { url: string }[],
	) => {
		setItems((current) =>
			current.map((item, itemIndex) =>
				itemIndex === index
					? {
							...item,
							newProductDraft: {
								name: item.newProductDraft?.name ?? item.description ?? "",
								amount: item.newProductDraft?.amount ?? "Unknown",
								potency: item.newProductDraft?.potency ?? "Unknown",
								images: item.newProductDraft?.images ?? [],
								...item.newProductDraft,
								[field]: value as never,
							},
						}
					: item,
			),
		);
	};

	const removeItem = (index: number) => {
		setItems((current) => {
			if (current.length === 1) return current;
			return current.filter((_, itemIndex) => itemIndex !== index);
		});
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (aiData) {
			if (hasUnresolvedAiItems(items)) {
				toast.error("Resolve all unmatched products before saving");
				return;
			}

			importPurchaseMutation.mutate(buildImportedPurchasePayload({
				provider: provider as PurchaseDetailType["provider"],
				externalOrderNumber,
				trackingNumber,
				shippingCost,
				notes,
				orderedAt,
				shippedAt,
				forwarderReceivedAt,
			}, items));
			return;
		}

		const payload = buildPurchasePayload(
			{
				provider: provider as PurchaseDetailType["provider"],
				externalOrderNumber,
				trackingNumber,
				shippingCost,
				notes,
				orderedAt,
				shippedAt,
				forwarderReceivedAt,
				receivedAt: purchase?.receivedAt ?? null,
				cancelledAt: purchase?.cancelledAt ?? null,
			},
			items,
		);

		if (purchase) {
			updatePurchaseMutation.mutate({ id: purchase.id, data: payload } as never);
			return;
		}

		createPurchaseMutation.mutate(payload as never);
	};

	return (
		<form className="space-y-6" onSubmit={handleSubmit}>
			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="provider">Provider</Label>
					<Select value={provider} onValueChange={setProvider}>
						<SelectTrigger id="provider">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="amazon">Amazon</SelectItem>
							<SelectItem value="iherb">iHerb</SelectItem>
							<SelectItem value="naturebell">Naturebell</SelectItem>
							<SelectItem value="unknown">Unknown</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="externalOrderNumber">External order number</Label>
					<Input
						id="externalOrderNumber"
						value={externalOrderNumber}
						onChange={(event) => setExternalOrderNumber(event.target.value)}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="trackingNumber">Tracking number</Label>
					<Input
						id="trackingNumber"
						value={trackingNumber}
						onChange={(event) => setTrackingNumber(event.target.value)}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="shippingCost">Shipping cost</Label>
					<Input
						id="shippingCost"
						type="number"
						min={0}
						value={shippingCost}
						onChange={(event) => setShippingCost(Number(event.target.value))}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="orderedAt">Ordered at</Label>
					<Input
						id="orderedAt"
						type="datetime-local"
						value={orderedAt}
						onChange={(event) => setOrderedAt(event.target.value)}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="shippedAt">Shipped at</Label>
					<Input
						id="shippedAt"
						type="datetime-local"
						value={shippedAt}
						onChange={(event) => setShippedAt(event.target.value)}
					/>
				</div>

				<div className="space-y-2 md:col-span-2">
					<Label htmlFor="forwarderReceivedAt">Forwarder received at</Label>
					<Input
						id="forwarderReceivedAt"
						type="datetime-local"
						value={forwarderReceivedAt}
						onChange={(event) => setForwarderReceivedAt(event.target.value)}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="notes">Notes</Label>
					<Textarea
						id="notes"
						value={notes}
						onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
							setNotes(event.target.value)
						}
					rows={4}
				/>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="font-heading text-lg">Items</h3>
					{!aiData ? (
						<Button
							type="button"
							onClick={() =>
								setItems((current) => [...current, { ...EMPTY_LINE }])
							}
							className="gap-2"
						>
							<Plus className="h-4 w-4" />
							Add item
						</Button>
					) : null}
				</div>

				<div className="space-y-4">
					{items.map((item, index) => (
						<PurchaseLineEditor
							key={item.id ?? `new-${index}`}
							item={item}
							index={index}
							products={products}
							brands={brands}
							categories={categories}
							isAiMode={Boolean(aiData)}
							canRemove={items.length > 1 && !aiData}
							onUpdateItem={updateItem}
							onUpdateDraft={updateDraft}
							onRemove={removeItem}
						/>
					))}
				</div>
			</div>

			<div className="rounded-base border-2 border-border bg-card p-4">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Merchandise total</span>
					<span>{formatCurrency(subtotal)}</span>
				</div>
				<div className="mt-2 flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Shipping</span>
					<span>{formatCurrency(Number(shippingCost) || 0)}</span>
				</div>
				<div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
					<span>Total landed cost</span>
					<span>{formatCurrency(subtotal + (Number(shippingCost) || 0))}</span>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Button type="submit" disabled={isSubmitting} className="gap-2">
					{isSubmitting ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : null}
					{purchase
						? "Update purchase"
						: aiData
							? "Save imported purchase"
							: "Create purchase"}
				</Button>
				{aiData && onResetAI ? (
					<Button type="button" variant="outline" onClick={onResetAI}>
						Rescan invoice
					</Button>
				) : null}
			</div>
		</form>
	);
}
