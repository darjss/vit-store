import { ArrowLeftIcon } from "@solar-icons/solid/linear/arrow-left";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DangerTriangleIcon } from "@solar-icons/solid/linear/danger-triangle";
import { PenNewSquareIcon } from "@solar-icons/solid/linear/pen-new-square";
import { TrashBinTrashIcon } from "@solar-icons/solid/linear/trash-bin-trash";
import {
	createMutation,
	createQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { Link, useNavigate, useParams } from "@tanstack/solid-router";
import { formatExpirationMonthYear, LOW_STOCK_THRESHOLD } from "@vit/shared";
import {
	Button,
	EmptyState,
	FormSection,
	InlineAlert,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	showToast,
	TextArea,
	Toaster,
} from "@vit/ui";
import { createSignal, For, type JSX, Show } from "solid-js";

import { invalidateProductsForWrite, removeProductFromCaches } from "./cache";
import { ConfirmDialog } from "./components/confirm-dialog";
import { FormDialog } from "./components/form-dialog";
import { ErrorState, ProductCardSkeleton } from "./components/page-states";
import { ProductStatusBadge } from "./components/status-badge";
import { StockEditor } from "./components/stock-editor";
import { isNotFoundError, productErrorToMessage } from "./errors";
import { ProductForm } from "./form/product-form";
import {
	deleteProductMutationOptions,
	type EditableProductField,
	updateProductFieldMutationOptions,
} from "./mutations";
import {
	productDetailQueryOptions,
	restockWaitCountQueryOptions,
} from "./queries";
import {
	formatPrice,
	PRODUCT_STATUS_OPTIONS,
	type ProductDetail,
	type ProductStatus,
} from "./types";

export function ProductDetailPage() {
	const params = useParams({ from: "/_app/products/$productId" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [editOpen, setEditOpen] = createSignal(false);
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	const productId = () => {
		const value = Number(params().productId);
		return Number.isInteger(value) && value > 0 ? value : null;
	};

	const productQuery = createQuery(() => ({
		...productDetailQueryOptions(productId() ?? 0),
		enabled: productId() !== null,
	}));
	const waitQuery = createQuery(() => ({
		...restockWaitCountQueryOptions(productId() ?? 0),
		enabled: productId() !== null && !productQuery.isError,
	}));

	const fieldMutation = createMutation(() => ({
		...updateProductFieldMutationOptions(),
		onError: (error) => {
			showToast({
				title: "Хадгалах боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			showToast({ title: "Шинэчлэгдлээ", variant: "success" });
		},
		onSettled: () => {
			const id = productId();
			if (id !== null) {
				void invalidateProductsForWrite(queryClient, id);
			}
		},
	}));

	const saveField = (
		field: EditableProductField,
		value: string | undefined,
	) => {
		const id = productId();
		if (id === null || fieldMutation.isPending) return;
		fieldMutation.mutate({
			id,
			field,
			...(value !== undefined ? { stringValue: value || undefined } : {}),
		});
	};

	const saveNumberField = (field: EditableProductField, value: string) => {
		const n = Number.parseFloat(value);
		if (Number.isNaN(n)) return;
		saveFieldWithNumber(field, Math.max(0, n));
	};

	const saveFieldWithNumber = (field: EditableProductField, value: number) => {
		const id = productId();
		if (id === null || fieldMutation.isPending) return;
		fieldMutation.mutate({
			id,
			field,
			numberValue: value,
		});
	};

	const deleteMutation = createMutation(() => ({
		...deleteProductMutationOptions(),
		onMutate: async (vars) => {
			await queryClient.cancelQueries({ queryKey: ["products"] });
			const rollback = removeProductFromCaches(queryClient, vars.id);
			return { rollback };
		},
		onError: (error, _vars, context) => {
			context?.rollback();
			showToast({
				title: "Устгах боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			setDeleteOpen(false);
			showToast({ title: "Бараа устгагдлаа", variant: "success" });
			void navigate({ to: "/products" });
		},
	}));

	return (
		<div class="space-y-5">
			<Toaster />

			<Show
				when={productId() !== null && !productQuery.isPending}
				fallback={
					<div class="space-y-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-3/4" />
						<div class="grid grid-cols-3 gap-2">
							<For each={[0, 1, 2]}>
								{() => <Skeleton class="h-16 w-full rounded-ui" />}
							</For>
						</div>
						<ProductCardSkeleton />
					</div>
				}
			>
				<Show when={productId() === null}>
					<EmptyState
						icon={<CloseCircleIcon />}
						title="Бараа олдсонгүй"
						description="Буруу холбоос байна. Барааны жагсаалтаас үргэлжлүүлнэ үү."
						action={
							<Link to="/products">
								<Button variant="secondary">Барааны жагсаалт</Button>
							</Link>
						}
					/>
				</Show>

				<Show when={productQuery.isError} fallback={null}>
					<Show
						when={isNotFoundError(productQuery.error)}
						fallback={
							<ErrorState
								description="Барааны мэдээлэл ачаалах боломжгүй. Дахин оролдоно уу."
								onRetry={() => void productQuery.refetch()}
							/>
						}
					>
						<EmptyState
							icon={<CloseCircleIcon />}
							title="Бараа олдсонгүй"
							description="Бараа устгагдсан эсвэл буруу холбоос байна."
							action={
								<Link to="/products">
									<Button variant="secondary">Барааны жагсаалт</Button>
								</Link>
							}
						/>
					</Show>
				</Show>

				<Show when={productQuery.data} keyed>
					{(product) => (
						<ProductDetailBody
							product={product}
							waitCount={() => waitQuery.data?.waitCount}
							fieldPending={fieldMutation.isPending}
							onSaveField={saveField}
							onSaveNumberField={saveNumberField}
							onEdit={() => setEditOpen(true)}
							onDelete={() => setDeleteOpen(true)}
							deletePending={deleteMutation.isPending}
						/>
					)}
				</Show>
			</Show>

			<Show when={productQuery.data} keyed>
				{(product) => (
					<>
						<FormDialog
							open={editOpen()}
							onOpenChange={setEditOpen}
							title="Бүтээгдэхүүн засах"
						>
							{(reportDirty) => (
								<ProductForm
									product={product}
									onDirtyChange={reportDirty}
									onSaved={() => setEditOpen(false)}
								/>
							)}
						</FormDialog>

						<ConfirmDialog
							open={deleteOpen()}
							onOpenChange={setDeleteOpen}
							title="Барааг устгах"
							description={`«${product.name}»-ийг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`}
							confirmLabel="Устгах"
							variant="destructive"
							pending={deleteMutation.isPending}
							onConfirm={() => {
								const id = productId();
								if (id !== null) deleteMutation.mutate({ id });
							}}
						/>
					</>
				)}
			</Show>
		</div>
	);
}

interface DetailBodyProps {
	product: ProductDetail;
	waitCount: () => number | undefined;
	fieldPending: boolean;
	onSaveField: (field: EditableProductField, value: string | undefined) => void;
	onSaveNumberField: (field: EditableProductField, value: string) => void;
	onEdit: () => void;
	onDelete: () => void;
	deletePending: boolean;
}

function ProductDetailBody(props: DetailBodyProps) {
	const product = props.product;
	const [featuredIndex, setFeaturedIndex] = createSignal(0);

	const images = () => product.images;
	const featured = () => images()[featuredIndex()]?.url;

	const changeStatus = (value: ProductStatus) => {
		if (value === product.status) return;
		props.onSaveField("status", value);
	};

	const lowStock = () =>
		product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;

	return (
		<div class="space-y-5">
			<div>
				<Link
					to="/products"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 font-bold text-[13px] text-ink-2 transition-colors hover:text-ink"
				>
					<ArrowLeftIcon class="size-4" />
					Бараа
				</Link>
				<h1 class="mt-2 font-extrabold text-2xl text-ink tracking-tight">
					{product.name}
				</h1>
				<p class="mt-1 font-mono text-ink-2 text-xs">{product.slug}</p>
			</div>

			<Show when={product.stock === 0 || lowStock()}>
				<InlineAlert tone={product.stock === 0 ? "error" : "warning"}>
					{product.stock === 0
						? "Бараа дууссан. Нөөц нэмэх шаардлагатай."
						: `Зөвхөн ${product.stock} ширхэг үлдсэн. Удахгүй нөөц нэмэх хэрэгтэй.`}
				</InlineAlert>
			</Show>

			<div class="flex flex-wrap items-center gap-2">
				<ProductStatusBadge status={product.status} stock={product.stock} />
				<Select
					options={PRODUCT_STATUS_OPTIONS}
					optionValue={(option) => option.value}
					optionTextValue={(option) => option.label}
					itemComponent={(itemProps) => (
						<SelectItem item={itemProps.item} class="relative">
							{itemProps.item.rawValue.label}
						</SelectItem>
					)}
					value={
						PRODUCT_STATUS_OPTIONS.find(
							(option) => option.value === product.status,
						) ?? null
					}
					onChange={(value) => value && changeStatus(value.value)}
					disabled={props.fieldPending}
				>
					<SelectTrigger class="h-10 w-36">
						<SelectValue<{ value: ProductStatus; label: string }>>
							{(state) => state.selectedOption()?.label ?? product.status}
						</SelectValue>
					</SelectTrigger>
					<SelectContent />
				</Select>
				<div class="ml-auto flex items-center gap-2">
					<Button size="compact" onClick={props.onEdit}>
						<PenNewSquareIcon />
						Засах
					</Button>
					<Button
						size="compact"
						variant="outline"
						class="border-coral/40 text-coral-ink hover:border-coral"
						onClick={props.onDelete}
						disabled={props.deletePending}
					>
						<TrashBinTrashIcon />
						Устгах
					</Button>
				</div>
			</div>

			<Show when={images().length > 0}>
				<div class="space-y-2">
					<div class="aspect-square max-w-md overflow-hidden rounded-2xl border border-rule bg-surface-2">
						<Show
							when={featured()}
							fallback={
								<div
									class="grid h-full w-full place-items-center text-ink-2/40"
									aria-hidden="true"
								>
									<DangerTriangleIcon class="size-10" />
								</div>
							}
						>
							{(url) => (
								<img
									src={url()}
									alt={product.name}
									class="h-full w-full object-cover"
								/>
							)}
						</Show>
					</div>
					<Show when={images().length > 1}>
						<div class="flex gap-2 overflow-x-auto pb-1">
							<For each={images()}>
								{(image, index) => (
									<button
										type="button"
										onClick={() => setFeaturedIndex(index())}
										aria-label={`Зураг ${index() + 1} үзэх`}
										aria-current={
											featuredIndex() === index() ? "true" : undefined
										}
										class={`size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${featuredIndex() === index() ? "border-butter" : "border-rule hover:border-ink-2"}`}
									>
										<img
											src={image.url}
											alt=""
											class="h-full w-full object-cover"
										/>
									</button>
								)}
							</For>
						</div>
					</Show>
				</div>
			</Show>

			<div class="grid grid-cols-3 gap-2">
				<div class="rounded-ui border border-rule bg-surface p-3 shadow-card">
					<p class="font-extrabold text-sm tabular-nums">
						{formatPrice(product.price)}
					</p>
					<p class="mt-0.5 text-ink-2 text-xs">Үнэ</p>
				</div>
				<div class="rounded-ui border border-rule bg-surface p-3 shadow-card">
					<p class="font-extrabold text-sm tabular-nums">{product.stock}</p>
					<p class="mt-0.5 text-ink-2 text-xs">Нөөц</p>
				</div>
				<div class="rounded-ui border border-rule bg-surface p-3 shadow-card">
					<p class="font-extrabold text-sm tabular-nums">
						{props.waitCount() ?? "—"}
					</p>
					<p class="mt-0.5 text-ink-2 text-xs">Хүлээж буй</p>
				</div>
			</div>

			<FormSection title="Үндсэн мэдээлэл">
				<EditableField
					label="Нэр"
					value={product.name}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveField("name", value)}
				/>
				<EditableField
					label="Тайлбар"
					type="textarea"
					value={product.description}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveField("description", value)}
				/>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<p class="font-bold text-ink-2 text-xs">Брэнд</p>
						<p class="mt-1 font-medium text-ink">
							{product.brand?.name ?? "Тодорхойлоогүй"}
						</p>
					</div>
					<div>
						<p class="font-bold text-ink-2 text-xs">Ангилал</p>
						<p class="mt-1 font-medium text-ink">
							{product.category?.name ?? "Тодорхойлоогүй"}
						</p>
					</div>
				</div>
			</FormSection>

			<FormSection title="Үнэ ба үлдэгдэл">
				<EditableField
					label="Үнэ (₮)"
					type="number"
					value={String(product.price)}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveNumberField("price", value)}
				/>
				<StockField label="Нөөц" value={product.stock}>
					<StockEditor product={{ id: product.id, stock: product.stock }} />
				</StockField>
				<EditableField
					label="Дуусах хугацаа"
					type="month"
					value={product.expirationDate ?? ""}
					pending={props.fieldPending}
					onSave={(value) =>
						props.onSaveField("expirationDate", value || undefined)
					}
				/>
				<EditableField
					label="Хүч"
					value={product.potency}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveField("potency", value)}
				/>
				<EditableField
					label="Хэмжээ"
					value={product.amount}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveField("amount", value)}
				/>
				<EditableField
					label="Өдрийн тун"
					type="number"
					value={String(product.dailyIntake)}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveNumberField("dailyIntake", value)}
				/>
				<EditableField
					label="Хямдрал (%)"
					type="number"
					value={String(product.discount)}
					pending={props.fieldPending}
					onSave={(value) => props.onSaveNumberField("discount", value)}
				/>
			</FormSection>

			<Button class="w-full" variant="secondary" onClick={props.onEdit}>
				<PenNewSquareIcon />
				Бүтээгдэхүүн засах
			</Button>
		</div>
	);
}

function StockField(props: {
	label: string;
	value: number;
	children: JSX.Element;
}) {
	return (
		<div class="flex items-center justify-between gap-3 rounded-ui border border-rule px-4 py-2.5">
			<div>
				<p class="font-bold text-ink-2 text-xs">{props.label}</p>
				<p class="mt-0.5 font-extrabold text-sm tabular-nums">{props.value}</p>
			</div>
			{props.children}
		</div>
	);
}

interface EditableFieldProps {
	label: string;
	value: string;
	type?: "text" | "textarea" | "number" | "month";
	pending: boolean;
	onSave: (value: string) => void;
}

function EditableField(props: EditableFieldProps) {
	const [editing, setEditing] = createSignal(false);
	const [draft, setDraft] = createSignal(props.value);

	const startEdit = () => {
		setDraft(props.value);
		setEditing(true);
	};
	const cancelEdit = () => {
		setDraft(props.value);
		setEditing(false);
	};
	const save = () => {
		if (props.pending) return;
		setEditing(false);
		props.onSave(draft());
	};

	return (
		<div class="flex items-center justify-between gap-3 rounded-ui border border-rule px-4 py-2.5">
			<div class="min-w-0 flex-1">
				<p class="font-bold text-ink-2 text-xs">{props.label}</p>
				<Show
					when={editing()}
					fallback={
						<p class="mt-0.5 break-words font-medium text-ink text-sm">
							{props.type === "month"
								? formatExpirationMonthYear(props.value || null)
								: props.value || "Тодорхойлоогүй"}
						</p>
					}
				>
					<div class="mt-1">
						<Show
							when={props.type === "textarea"}
							fallback={
								<Input
									type={
										props.type === "number"
											? "number"
											: props.type === "month"
												? "month"
												: "text"
									}
									value={draft()}
									disabled={props.pending}
									aria-label={props.label}
									onInput={(event) => setDraft(event.currentTarget.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") save();
										if (event.key === "Escape") cancelEdit();
									}}
									class="h-11"
								/>
							}
						>
							<TextArea
								value={draft()}
								disabled={props.pending}
								aria-label={props.label}
								onInput={(event) => setDraft(event.currentTarget.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
										save();
									if (event.key === "Escape") cancelEdit();
								}}
								class="min-h-24"
							/>
						</Show>
						<div class="mt-1.5 flex gap-1.5">
							<Button size="compact" loading={props.pending} onClick={save}>
								Хадгалах
							</Button>
							<Button size="compact" variant="outline" onClick={cancelEdit}>
								Цуцлах
							</Button>
						</div>
					</div>
				</Show>
			</div>
			<Show when={!editing()}>
				<Button
					size="compact"
					variant="ghost"
					onClick={startEdit}
					aria-label={`${props.label} засах`}
				>
					<PenNewSquareIcon />
				</Button>
			</Show>
		</div>
	);
}
