import { BoxMinimalisticIcon } from "@solar-icons/solid/linear/box-minimalistic";
import { MenuDotsIcon } from "@solar-icons/solid/linear/menu-dots";
import { PenNewSquareIcon } from "@solar-icons/solid/linear/pen-new-square";
import { TrashBinTrashIcon } from "@solar-icons/solid/linear/trash-bin-trash";
import { WidgetIcon } from "@solar-icons/solid/linear/widget";
import {
	createMutation,
	createQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { Link, useNavigate } from "@tanstack/solid-router";
import {
	Button,
	IconButton,
	Menu,
	MenuContent,
	MenuItem,
	MenuSeparator,
	MenuTrigger,
	Skeleton,
	showToast,
} from "@vit/ui";
import { createSignal, Show } from "solid-js";

import {
	invalidateProductDetail,
	invalidateProductLists,
	removeProductFromCaches,
} from "../cache";
import { productErrorToMessage } from "../errors";
import { ProductForm } from "../form/product-form";
import {
	deleteProductMutationOptions,
	updateProductFieldMutationOptions,
} from "../mutations";
import { productDetailQueryOptions } from "../queries";
import { formatPrice, type ProductCardData } from "../types";
import { ConfirmDialog } from "./confirm-dialog";
import { ExpirationEditor } from "./expiration-editor";
import { FormDialog } from "./form-dialog";
import { ProductStatusBadge } from "./status-badge";
import { StockEditor } from "./stock-editor";

interface ProductCardProps {
	product: ProductCardData;
}

export function ProductCard(props: ProductCardProps) {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [editOpen, setEditOpen] = createSignal(false);
	const [activateOpen, setActivateOpen] = createSignal(false);
	const [zeroOpen, setZeroOpen] = createSignal(false);
	const [deleteOpen, setDeleteOpen] = createSignal(false);

	// Full detail for the edit dialog. Warm from the cache for list items;
	// fetched on demand for instant-search results (their shape is minimal).
	const detailQuery = createQuery(() => ({
		...productDetailQueryOptions(props.product.id),
		enabled: editOpen(),
	}));

	const primaryImage = () =>
		props.product.images.find((image) => image.isPrimary)?.url ??
		props.product.images[0]?.url;

	const isActive = () => props.product.status === "active";

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
		},
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: ["products", "list"] });
			void queryClient.invalidateQueries({ queryKey: ["products", "instant"] });
		},
	}));

	const activateMutation = createMutation(() => ({
		...updateProductFieldMutationOptions(),
		onError: (error) => {
			showToast({
				title: "Идэвхжүүлэх боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			setActivateOpen(false);
			showToast({ title: "Бараа идэвхжлээ", variant: "success" });
		},
		onSettled: () => {
			void invalidateProductLists(queryClient);
			void invalidateProductDetail(queryClient, props.product.id);
		},
	}));

	const zeroMutation = createMutation(() => ({
		...updateProductFieldMutationOptions(),
		onError: (error) => {
			showToast({
				title: "Үлдэгдэл тэглэх боломжгүй",
				description: productErrorToMessage(error, "Алдаа гарлаа"),
				variant: "error",
			});
		},
		onSuccess: () => {
			setZeroOpen(false);
			showToast({ title: "Үлдэгдэл тэглэгдлээ", variant: "success" });
		},
		onSettled: () => {
			void invalidateProductLists(queryClient);
			void invalidateProductDetail(queryClient, props.product.id);
		},
	}));

	return (
		<>
			<article class="rounded-2xl border border-rule bg-surface p-3 shadow-card">
				<div class="flex items-start gap-3">
					<Link
						to="/products/$productId"
						params={{ productId: String(props.product.id) }}
						class="shrink-0 rounded-[9px] bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
						aria-label={`${props.product.name} — дэлгэрэнгүй`}
					>
						<Show
							when={primaryImage()}
							fallback={
								<div
									class="grid size-[68px] place-items-center text-ink-2/40"
									aria-hidden="true"
								>
									<BoxMinimalisticIcon class="size-7" />
								</div>
							}
						>
							{(url) => (
								<img
									src={url()}
									alt=""
									loading="lazy"
									class="size-[68px] rounded-[9px] border border-ink/5 object-cover"
								/>
							)}
						</Show>
					</Link>

					<div class="min-w-0 flex-1">
						<Link
							to="/products/$productId"
							params={{ productId: String(props.product.id) }}
							class="line-clamp-2 font-bold text-[13.5px] text-ink leading-[1.35] hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
						>
							{props.product.name}
						</Link>
						<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-extrabold text-sm tabular-nums">
								{formatPrice(props.product.price)}
							</span>
							<ProductStatusBadge
								status={props.product.status}
								stock={props.product.stock}
							/>
						</div>
						<div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
							<StockEditor product={props.product} />
							<ExpirationEditor product={props.product} />
						</div>
						<Show when={!isActive()}>
							<div class="mt-2">
								<Button size="compact" onClick={() => setActivateOpen(true)}>
									Идэвхжүүлэх
								</Button>
							</div>
						</Show>
					</div>

					<Menu>
						<MenuTrigger
							as={IconButton}
							label="Үйлдлүүд"
							variant="secondary"
							class="size-10 shrink-0 rounded-lg"
						>
							<MenuDotsIcon />
						</MenuTrigger>
						<MenuContent class="w-52">
							<MenuItem
								onSelect={() =>
									void navigate({
										to: "/products/$productId",
										params: { productId: String(props.product.id) },
									})
								}
							>
								<WidgetIcon />
								Дэлгэрэнгүй
							</MenuItem>
							<MenuItem onSelect={() => setEditOpen(true)}>
								<PenNewSquareIcon />
								Засах
							</MenuItem>
							<MenuItem
								onSelect={() => setZeroOpen(true)}
								disabled={props.product.stock === 0}
							>
								<BoxMinimalisticIcon />
								Үлдэгдэл тэглэх
							</MenuItem>
							<MenuSeparator />
							<MenuItem
								class="text-coral-ink focus:bg-coral/15"
								onSelect={() => setDeleteOpen(true)}
							>
								<TrashBinTrashIcon />
								Устгах
							</MenuItem>
						</MenuContent>
					</Menu>
				</div>
			</article>

			<ConfirmDialog
				open={activateOpen()}
				onOpenChange={setActivateOpen}
				title="Барааг идэвхжүүлэх"
				description={`«${props.product.name}»-ийг идэвхтэй төлөвт оруулах уу? Дэлгүүрт харагдана.`}
				confirmLabel="Идэвхжүүлэх"
				pending={activateMutation.isPending}
				onConfirm={() =>
					activateMutation.mutate({
						id: props.product.id,
						field: "status",
						stringValue: "active",
					})
				}
			/>

			<ConfirmDialog
				open={zeroOpen()}
				onOpenChange={setZeroOpen}
				title="Үлдэгдэл тэглэх"
				description={`«${props.product.name}»-ийн үлдэгдлийг 0 болгох уу? Дэлгүүрт дууссан гэж харагдана.`}
				confirmLabel="Тэглэх"
				variant="destructive"
				pending={zeroMutation.isPending}
				onConfirm={() =>
					zeroMutation.mutate({
						id: props.product.id,
						field: "stock",
						numberValue: 0,
					})
				}
			/>

			<ConfirmDialog
				open={deleteOpen()}
				onOpenChange={setDeleteOpen}
				title="Барааг устгах"
				description={`«${props.product.name}»-ийг устгах уу? Энэ үйлдлийг буцаах боломжгүй.`}
				confirmLabel="Устгах"
				variant="destructive"
				pending={deleteMutation.isPending}
				onConfirm={() => deleteMutation.mutate({ id: props.product.id })}
			/>

			<FormDialog
				open={editOpen()}
				onOpenChange={setEditOpen}
				title="Бүтээгдэхүүн засах"
			>
				{(reportDirty) => (
					<Show
						when={detailQuery.data}
						fallback={
							<div class="space-y-3 py-4">
								<Skeleton class="h-12 w-full" />
								<Skeleton class="h-12 w-full" />
								<Skeleton class="h-12 w-3/4" />
							</div>
						}
					>
						{(product) => (
							<ProductForm
								product={product()}
								onDirtyChange={reportDirty}
								onSaved={() => setEditOpen(false)}
							/>
						)}
					</Show>
				)}
			</FormDialog>
		</>
	);
}
