import { useMutation, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import { purchaseProvider } from "@vit/shared";
import { Loader2, Plus } from "lucide-react";
import { type ChangeEvent, type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { parsePicklistValue } from "@/lib/parse-select";
import { formatCurrency } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { invalidatePurchaseLists } from "./invalidate-purchase-lists";
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

function handlePurchaseMutationError(message: string) {
	toast.error(message);
}

// ponytail: legacy admin purchase form — split sections later; complexity ceiling 36
// oxlint-disable-next-line complexity
export default function PurchaseForm({
	aiData,
	onResetAI,
	onSuccess,
	purchase,
}: PurchaseFormProps) {
	const queryClient = useQueryClient();
	const [{ data: products }, { data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.product.getAllProducts.queryOptions(),
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const [provider, setProvider] = useState<(typeof purchaseProvider)[number]>(
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
	const [notes, setNotes] = useState(aiData?.header.notes ?? purchase?.notes ?? "");
	const [orderedAt, setOrderedAt] = useState(
		toDateInputValue(aiData?.header.orderedAt ?? purchase?.orderedAt),
	);
	const [shippedAt, setShippedAt] = useState(toDateInputValue(purchase?.shippedAt));
	const [forwarderReceivedAt, setForwarderReceivedAt] = useState(
		toDateInputValue(purchase?.forwarderReceivedAt),
	);
	const [items, setItems] = useState<Array<PurchaseLineState>>(
		getInitialPurchaseItems({ aiData, purchase }),
	);
	const [seededAiData, setSeededAiData] = useState(aiData);
	if (aiData !== seededAiData) {
		setSeededAiData(aiData);
		if (aiData) {
			setProvider(aiData.header.provider);
			setExternalOrderNumber(aiData.header.externalOrderNumber ?? "");
			setTrackingNumber(aiData.header.trackingNumber ?? "");
			setShippingCost(aiData.header.shippingCost ?? 0);
			setNotes(aiData.header.notes ?? "");
			setOrderedAt(toDateInputValue(aiData.header.orderedAt));
			setItems(getInitialPurchaseItems({ aiData }));
		}
	}

	const subtotal = useMemo(
		() => items.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0),
		[items],
	);

	const handleMutationSuccess = (purchaseId: number) => {
		void invalidatePurchaseLists(queryClient);
		queryClient.invalidateQueries(trpc.purchase.getAllPurchases.queryOptions());
		queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		if (purchase) {
			queryClient.invalidateQueries(
				trpc.purchase.getPurchaseById.queryOptions({ id: purchase.id }),
			);
		}
		toast.success(purchase ? "Худалдан авалт шинэчлэгдлээ" : "Худалдан авалт хадгалагдлаа");
		onSuccess?.(purchaseId);
	};

	const createPurchaseMutation = useMutation({
		...trpc.purchase.addPurchase.mutationOptions(),
		onError: (error) => handlePurchaseMutationError(error.message),
		onSuccess: (result) => handleMutationSuccess(result.id),
	});

	const updatePurchaseMutation = useMutation({
		...trpc.purchase.updatePurchase.mutationOptions(),
		onError: (error) => handlePurchaseMutationError(error.message),
		onSuccess: () => {
			if (purchase) {
				handleMutationSuccess(purchase.id);
			}
		},
	});

	const importPurchaseMutation = useMutation({
		...trpc.aiPurchase.saveExtractedPurchase.mutationOptions(),
		onError: (error) => handlePurchaseMutationError(error.message),
		onSuccess: (result) => handleMutationSuccess(result.id),
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
			current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
		);
	};

	const updateDraft = <K extends keyof NonNullable<PurchaseLineState["newProductDraft"]>>(
		index: number,
		field: K,
		value: NonNullable<PurchaseLineState["newProductDraft"]>[K],
	) => {
		setItems((current) =>
			current.map((item, itemIndex) =>
				itemIndex === index
					? {
							...item,
							newProductDraft: {
								amount: item.newProductDraft?.amount ?? "Unknown",
								images: item.newProductDraft?.images ?? [],
								name: item.newProductDraft?.name ?? item.description ?? "",
								potency: item.newProductDraft?.potency ?? "Unknown",
								...item.newProductDraft,
								[field]: value,
							},
						}
					: item,
			),
		);
	};

	const removeItem = (index: number) => {
		setItems((current) => {
			if (current.length === 1) {
				return current;
			}
			return current.filter((_, itemIndex) => itemIndex !== index);
		});
	};

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (aiData) {
			if (hasUnresolvedAiItems(items)) {
				toast.error("Хадгалахаас өмнө тохироогүй бүх барааг шийдвэрлэнэ үү");
				return;
			}

			importPurchaseMutation.mutate(
				buildImportedPurchasePayload(
					{
						externalOrderNumber,
						forwarderReceivedAt,
						notes,
						orderedAt,
						provider,
						shippedAt,
						shippingCost,
						trackingNumber,
					},
					items,
				),
			);
			return;
		}

		const payload = buildPurchasePayload(
			{
				cancelledAt: purchase?.cancelledAt ?? null,
				externalOrderNumber,
				forwarderReceivedAt,
				notes,
				orderedAt,
				provider,
				receivedAt: purchase?.receivedAt ?? null,
				shippedAt,
				shippingCost,
				trackingNumber,
			},
			items,
		);

		if (purchase) {
			updatePurchaseMutation.mutate({
				data: payload,
				id: purchase.id,
			});
			return;
		}

		createPurchaseMutation.mutate(payload);
	};

	return (
		<form className="relative space-y-6" onSubmit={handleSubmit}>
			<FormLoadingOverlay isLoading={isSubmitting} />
			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="provider">Нийлүүлэгч</Label>
					<Select
						onValueChange={(value) => {
							const parsed = parsePicklistValue(purchaseProvider, value);
							if (parsed) {
								setProvider(parsed);
							}
						}}
						value={provider}
					>
						<SelectTrigger id="provider">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="amazon">Amazon</SelectItem>
							<SelectItem value="iherb">iHerb</SelectItem>
							<SelectItem value="naturebell">Naturebell</SelectItem>
							<SelectItem value="unknown">Тодорхойгүй</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-2">
					<Label htmlFor="externalOrderNumber">Гадаад захиалгын дугаар</Label>
					<Input
						id="externalOrderNumber"
						onChange={(event) => setExternalOrderNumber(event.target.value)}
						required
						value={externalOrderNumber}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="trackingNumber">Трек код</Label>
					<Input
						id="trackingNumber"
						onChange={(event) => setTrackingNumber(event.target.value)}
						value={trackingNumber}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="shippingCost">Хүргэлтийн зардал</Label>
					<Input
						id="shippingCost"
						min={0}
						onChange={(event) => setShippingCost(Number(event.target.value))}
						required
						type="number"
						value={shippingCost}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="orderedAt">Захиалсан огноо</Label>
					<Input
						id="orderedAt"
						onChange={(event) => setOrderedAt(event.target.value)}
						type="datetime-local"
						value={orderedAt}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="shippedAt">Илгээгдсэн огноо</Label>
					<Input
						id="shippedAt"
						onChange={(event) => setShippedAt(event.target.value)}
						type="datetime-local"
						value={shippedAt}
					/>
				</div>

				<div className="space-y-2 md:col-span-2">
					<Label htmlFor="forwarderReceivedAt">Зуучлагч хүлээн авсан огноо</Label>
					<Input
						id="forwarderReceivedAt"
						onChange={(event) => setForwarderReceivedAt(event.target.value)}
						type="datetime-local"
						value={forwarderReceivedAt}
					/>
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="notes">Тэмдэглэл</Label>
				<Textarea
					id="notes"
					onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setNotes(event.target.value)}
					rows={4}
					value={notes}
				/>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="font-heading text-lg">Бараа</h3>
					{!aiData ? (
						<Button
							className="gap-2"
							onClick={() => setItems((current) => [...current, { ...EMPTY_LINE }])}
							type="button"
						>
							<Plus className="h-4 w-4" />
							Бараа нэмэх
						</Button>
					) : null}
				</div>

				<div className="space-y-4">
					{items.map((item, index) => (
						<PurchaseLineEditor
							brands={brands}
							canRemove={items.length > 1 && !aiData}
							categories={categories}
							index={index}
							isAiMode={Boolean(aiData)}
							item={item}
							key={item.id ?? `new-${index}`}
							onRemove={removeItem}
							onUpdateDraft={updateDraft}
							onUpdateItem={updateItem}
							products={products}
						/>
					))}
				</div>
			</div>

			<div className="rounded-base border-border bg-card border-2 p-4">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Барааны дүн</span>
					<span>{formatCurrency(subtotal)}</span>
				</div>
				<div className="mt-2 flex items-center justify-between text-sm">
					<span className="text-muted-foreground">Хүргэлт</span>
					<span>{formatCurrency(Number(shippingCost) || 0)}</span>
				</div>
				<div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold">
					<span>Нийт өртөг</span>
					<span>{formatCurrency(subtotal + (Number(shippingCost) || 0))}</span>
				</div>
			</div>

			<div className="flex items-center gap-3">
				<Button className="gap-2" disabled={isSubmitting} type="submit">
					{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
					{purchase
						? "Худалдан авалт шинэчлэх"
						: aiData
							? "Оруулсан худалдан авалт хадгалах"
							: "Худалдан авалт үүсгэх"}
				</Button>
				{aiData && onResetAI ? (
					<Button onClick={onResetAI} type="button" variant="outline">
						Падаан дахин уншуулах
					</Button>
				) : null}
			</div>
		</form>
	);
}
