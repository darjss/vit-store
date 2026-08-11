/*
 * Order edit form (full order: customer, details, products) — the admin
 * override path. Uses updateOrder (the server recalculates total, sales and
 * stock). No manual transfer payment-claim UI: paymentStatus is a plain
 * select and customer_claimed_paid is auto-reconciled server-side.
 */
import { createMutation, createQuery } from "@tanstack/solid-query";
import { Bag2Icon } from "@solar-icons/solid/linear/bag-2";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
	orderStatus,
	paymentStatus,
	deliveryProvider,
} from "@vit/shared/constants";
import { updateOrderSchema } from "@vit/shared/schema";
import type {
	OrderDeliveryProviderType,
	OrderStatusType,
	PaymentStatusType,
} from "@vit/shared/types";
import * as v from "valibot";

import {
	Button,
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Field,
	FormSection,
	InlineAlert,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	TextArea,
	showToast,
} from "@vit/ui";

import { orderErrorMessage } from "./errors";
import {
	deliveryProviderLabel,
	mnt,
	ORDER_STATUS_META,
	PAYMENT_STATUS_META,
} from "./labels";
import { productInstantSearchQueryOptions } from "./queries";
import type { OrderListItem } from "./queries";
import { updateOrderMutationOptions } from "./mutations";

export interface OrderFormLine {
	productId: number;
	quantity: number;
	price: number;
	name: string;
	imageUrl?: string;
	stock?: number;
}

export interface OrderFormDraft {
	customerPhone: string;
	address: string;
	addressZoneId?: number;
	notes: string;
	status: OrderStatusType;
	paymentStatus: PaymentStatusType;
	deliveryProvider: OrderDeliveryProviderType;
	products: OrderFormLine[];
}

function draftFromOrder(order: OrderListItem): OrderFormDraft {
	return {
		customerPhone: order.customerPhone,
		address: order.address,
		addressZoneId: order.addressZoneId,
		notes: order.notes ?? "",
		status: order.status,
		paymentStatus: order.paymentStatus,
		deliveryProvider: order.deliveryProvider,
		products: order.products.map((product) => ({
			productId: product.productId,
			quantity: product.quantity,
			price: product.price,
			name: product.name,
			imageUrl: product.imageUrl,
		})),
	};
}

interface OrderFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	order: OrderListItem;
	onSaved: (orderId: number) => void;
}

export function OrderFormDialog(props: OrderFormDialogProps) {
	const [draft, setDraft] = createStore<OrderFormDraft>(
		draftFromOrder(props.order),
	);
	const [issues, setIssues] = createSignal<
		Array<{ field: string; message: string }>
	>([]);
	const [searchInput, setSearchInput] = createSignal("");
	const [debouncedQuery, setDebouncedQuery] = createSignal("");

	// Re-seed the draft each time the dialog opens for a (possibly different)
	// order; the store holds an explicit editable draft, never mirrored query
	// data (query-client rules).
	createEffect(() => {
		if (props.open) {
			setDraft(draftFromOrder(props.order));
			setIssues([]);
			setSearchInput("");
		}
	});

	// Debounce the product search by 300ms (legacy behaviour).
	createEffect(() => {
		const value = searchInput().trim();
		const timeout = setTimeout(() => setDebouncedQuery(value), 300);
		onCleanup(() => clearTimeout(timeout));
	});

	const searchQuery = createQuery(() =>
		productInstantSearchQueryOptions(debouncedQuery()),
	);

	const updateOrder = createMutation(() => updateOrderMutationOptions());

	const fieldError = (field: string) =>
		issues().find((issue) => issue.field === field)?.message;

	const totalPrice = () =>
		draft.products.reduce((sum, line) => sum + line.price * line.quantity, 0);
	const totalItems = () =>
		draft.products.reduce((sum, line) => sum + line.quantity, 0);

	const selectProduct = (product: {
		id: number;
		name: string;
		price: number;
		stock: number;
		images: Array<{ url: string }>;
	}) => {
		const existing = draft.products.find(
			(line) => line.productId === product.id,
		);
		if (existing) {
			if (product.stock !== undefined && existing.quantity >= product.stock) {
				return;
			}
			setDraft(
				"products",
				(line) => line.productId === product.id,
				"quantity",
				existing.quantity + 1,
			);
		} else {
			setDraft("products", (products) => [
				...products,
				{
					productId: product.id,
					quantity: 1,
					price: product.price,
					name: product.name,
					imageUrl: product.images[0]?.url,
					stock: product.stock,
				},
			]);
		}
		setSearchInput("");
		setDebouncedQuery("");
	};

	const changeQuantity = (productId: number, delta: 1 | -1) => {
		setDraft(
			produce((state) => {
				const line = state.products.find(
					(product) => product.productId === productId,
				);
				if (!line) return;
				const next = line.quantity + delta;
				const max = line.stock ?? Number.MAX_SAFE_INTEGER;
				line.quantity = Math.min(Math.max(next, 1), max);
			}),
		);
	};

	const removeLine = (productId: number) => {
		setDraft("products", (products) =>
			products.filter((line) => line.productId !== productId),
		);
	};

	const handleSubmit = () => {
		const parsed = v.safeParse(updateOrderSchema, {
			id: props.order.id,
			customerPhone: draft.customerPhone,
			address: draft.address,
			addressZoneId: draft.addressZoneId,
			notes: draft.notes || null,
			status: draft.status,
			paymentStatus: draft.paymentStatus,
			deliveryProvider: draft.deliveryProvider,
			isNewCustomer: false,
			products: draft.products.map((line) => ({
				productId: line.productId,
				quantity: line.quantity,
				price: line.price,
				name: line.name,
				imageUrl: line.imageUrl,
			})),
		});

		if (!parsed.success) {
			const mapped = parsed.issues.map((issue) => {
				const first = issue.path?.[0];
				return {
					field:
						first !== undefined && "key" in first ? String(first.key) : "form",
					message: issue.message,
				};
			});
			setIssues(mapped);
			return;
		}

		setIssues([]);
		updateOrder.mutate(parsed.output, {
			onSuccess: () => {
				props.onOpenChange(false);
				showToast({
					title: "Захиалга хадгалагдлаа",
					variant: "success",
				});
				props.onSaved(props.order.id);
			},
		});
	};

	const productsError = fieldError("products");

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent class="max-h-[85vh] max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Захиалга засах</DialogTitle>
					<DialogDescription>#{props.order.orderNumber}</DialogDescription>
				</DialogHeader>

				<div class="grid gap-6">
					<FormSection
						title="Харилцагчийн мэдээлэл"
						description="Утас, хүргэлтийн хаяг"
					>
						<Field label="Утасны дугаар" error={fieldError("customerPhone")}>
							<Input
								type="tel"
								inputmode="tel"
								autocomplete="tel"
								placeholder="Утасны дугаар оруулах"
								value={draft.customerPhone}
								onInput={(event) =>
									setDraft("customerPhone", event.currentTarget.value)
								}
							/>
						</Field>
						<Field label="Хүргэлтийн хаяг" error={fieldError("address")}>
							<TextArea
								placeholder="Хүргэлтийн хаяг оруулах"
								value={draft.address}
								onInput={(event) =>
									setDraft("address", event.currentTarget.value)
								}
							/>
						</Field>
					</FormSection>

					<FormSection
						title="Захиалгын дэлгэрэнгүй"
						description="Төлөв, төлбөр, хүргэлтийн арга"
					>
						<Field label="Тусгай заавар">
							<TextArea
								placeholder="Тусгай заавар эсвэл тэмдэглэл"
								value={draft.notes}
								onInput={(event) =>
									setDraft("notes", event.currentTarget.value)
								}
							/>
						</Field>
						<div class="grid gap-4 sm:grid-cols-2">
							<Field label="Захиалгын төлөв">
								<Select
									options={[...orderStatus]}
									optionValue={(s) => s}
									optionTextValue={(s) => ORDER_STATUS_META[s].label}
									itemComponent={(selectProps) => (
										<SelectItem item={selectProps.item}>
											{
												ORDER_STATUS_META[
													selectProps.item.rawValue as OrderStatusType
												].label
											}
										</SelectItem>
									)}
									value={draft.status}
									onChange={(value) =>
										setDraft(
											"status",
											(value as OrderStatusType) ?? draft.status,
										)
									}
									placeholder="Төлөв сонгох"
								>
									<SelectTrigger>
										<SelectValue<string>>
											{(state) =>
												ORDER_STATUS_META[
													state.selectedOption() as OrderStatusType
												]?.label ?? "Төлөв сонгох"
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</Field>
							<Field label="Төлбөрийн төлөв">
								<Select
									options={[...paymentStatus]}
									optionValue={(s) => s}
									optionTextValue={(s) => PAYMENT_STATUS_META[s].label}
									itemComponent={(selectProps) => (
										<SelectItem item={selectProps.item}>
											{
												PAYMENT_STATUS_META[
													selectProps.item.rawValue as PaymentStatusType
												].label
											}
										</SelectItem>
									)}
									value={draft.paymentStatus}
									onChange={(value) =>
										setDraft(
											"paymentStatus",
											(value as PaymentStatusType) ?? draft.paymentStatus,
										)
									}
									placeholder="Төлбөрийн төлөв сонгох"
								>
									<SelectTrigger>
										<SelectValue<string>>
											{(state) =>
												PAYMENT_STATUS_META[
													state.selectedOption() as PaymentStatusType
												]?.label ?? "Төлбөрийн төлөв сонгох"
											}
										</SelectValue>
									</SelectTrigger>
									<SelectContent />
								</Select>
							</Field>
						</div>
						<Field label="Хүргэлтийн арга">
							<Select
								options={[...deliveryProvider]}
								optionValue={(s) => s}
								optionTextValue={(s) => deliveryProviderLabel(s)}
								itemComponent={(selectProps) => (
									<SelectItem item={selectProps.item}>
										{deliveryProviderLabel(selectProps.item.rawValue)}
									</SelectItem>
								)}
								value={draft.deliveryProvider}
								onChange={(value) =>
									setDraft(
										"deliveryProvider",
										(value as OrderDeliveryProviderType) ??
											draft.deliveryProvider,
									)
								}
								placeholder="Хүргэлтийн арга сонгох"
							>
								<SelectTrigger>
									<SelectValue<string>>
										{(state) =>
											state.selectedOption()
												? deliveryProviderLabel(
														state.selectedOption() as OrderDeliveryProviderType,
													)
												: "Хүргэлтийн арга сонгох"
										}
									</SelectValue>
								</SelectTrigger>
								<SelectContent />
							</Select>
						</Field>
					</FormSection>

					<FormSection
						title="Бүтээгдэхүүн"
						description="Бараа нэмж, тоо ширхэгийг тохируулна"
					>
						<Field
							label="Бараа хайх"
							error={productsError}
							description={
								productsError ? undefined : "Нэрийг нь бичиж захиалгад нэмнэ"
							}
						>
							<div class="relative">
								<Input
									type="search"
									placeholder="Бүтээгдэхүүнийг нэрээр хайх..."
									value={searchInput()}
									onInput={(event) => setSearchInput(event.currentTarget.value)}
								/>
								<Show when={searchInput().trim().length > 0}>
									<div class="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-ui border border-rule bg-surface shadow-pop">
										<Show
											when={searchQuery.isPending || searchQuery.isFetching}
										>
											<p class="px-3 py-2.5 text-ink-2 text-xs">Хайж байна…</p>
										</Show>
										<Show
											when={
												searchQuery.isSuccess && searchQuery.data.length > 0
											}
										>
											<ul class="max-h-64 overflow-y-auto">
												<For each={searchQuery.data ?? []}>
													{(product) => (
														<li>
															<button
																type="button"
																class="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
																onClick={() => selectProduct(product)}
															>
																<Show
																	when={product.images[0]?.url}
																	fallback={
																		<span class="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
																			<Bag2Icon class="size-5" />
																		</span>
																	}
																>
																	{(url) => (
																		<img
																			src={url()}
																			alt=""
																			class="size-10 shrink-0 rounded-lg border border-rule object-cover"
																		/>
																	)}
																</Show>
																<span class="min-w-0 flex-1">
																	<span class="block truncate font-bold text-ink text-sm">
																		{product.name}
																	</span>
																	<span class="mt-0.5 block text-ink-2 text-xs tabular-nums">
																		{mnt(product.price)} · үлдэгдэл:{" "}
																		{product.stock}
																	</span>
																</span>
															</button>
														</li>
													)}
												</For>
											</ul>
										</Show>
										<Show
											when={
												searchQuery.isSuccess &&
												searchQuery.data.length === 0 &&
												!searchQuery.isFetching
											}
										>
											<p class="px-3 py-2.5 text-ink-2 text-xs">
												"{debouncedQuery()}" олдсонгүй
											</p>
										</Show>
									</div>
								</Show>
							</div>
						</Field>

						<div class="grid gap-2.5">
							<For each={draft.products}>
								{(line) => (
									<div class="rounded-ui border border-rule bg-surface-2/60 p-3">
										<div class="flex items-center gap-3">
											<Show
												when={line.imageUrl}
												fallback={
													<span class="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
														<Bag2Icon class="size-5" />
													</span>
												}
											>
												{(url) => (
													<img
														src={url()}
														alt=""
														class="size-11 shrink-0 rounded-lg border border-rule object-cover"
													/>
												)}
											</Show>
											<div class="min-w-0 flex-1">
												<p class="truncate font-bold text-ink text-sm">
													{line.name}
												</p>
												<p class="mt-0.5 text-ink-2 text-xs tabular-nums">
													{mnt(line.price)} /ш
												</p>
											</div>
											<Button
												variant="ghost"
												size="icon"
												aria-label={`${line.name} хасах`}
												onClick={() => removeLine(line.productId)}
											>
												<CloseCircleIcon class="size-5" />
											</Button>
										</div>
										<div class="mt-2.5 flex items-center justify-between gap-2">
											<div class="flex items-center gap-1">
												<Button
													variant="outline"
													size="icon"
													aria-label="Тоо ширхэг бууруулах"
													disabled={line.quantity <= 1}
													onClick={() => changeQuantity(line.productId, -1)}
												>
													−
												</Button>
												<span
													class="flex h-11 min-w-10 items-center justify-center rounded-ui border border-rule bg-surface px-2 font-bold text-ink text-sm tabular-nums"
													aria-live="polite"
												>
													{line.quantity}
												</span>
												<Button
													variant="outline"
													size="icon"
													aria-label="Тоо ширхэг нэмэгдүүлэх"
													disabled={
														line.stock !== undefined &&
														line.quantity >= line.stock
													}
													onClick={() => changeQuantity(line.productId, 1)}
												>
													+
												</Button>
											</div>
											<span class="font-bold text-ink text-sm tabular-nums">
												{mnt(line.price * line.quantity)}
											</span>
										</div>
									</div>
								)}
							</For>
							<Show when={draft.products.length === 0}>
								<div class="rounded-ui border border-rule border-dashed bg-surface px-4 py-6 text-center">
									<p class="font-bold text-ink-2 text-sm">
										Бүтээгдэхүүн сонгогдоогүй
									</p>
									<p class="mt-0.5 text-ink-2/70 text-xs">
										Бараа хайж захиалгад нэмнэ үү
									</p>
								</div>
							</Show>
						</div>

						<div class="flex flex-wrap items-center justify-between gap-2 rounded-ui border border-rule bg-surface-2/60 px-4 py-3">
							<span class="font-bold text-ink-2 text-sm">
								{totalItems()} ширхэг
							</span>
							<span class="font-bold text-base text-ink tabular-nums">
								Нийт {mnt(totalPrice())}
							</span>
						</div>
					</FormSection>

					<Show when={updateOrder.isError}>
						<InlineAlert tone="error">
							{orderErrorMessage(updateOrder.error)}
						</InlineAlert>
					</Show>
				</div>

				<DialogFooter>
					<Button
						variant="ghost"
						disabled={updateOrder.isPending}
						onClick={() => props.onOpenChange(false)}
					>
						Болих
					</Button>
					<Button loading={updateOrder.isPending} onClick={handleSubmit}>
						{updateOrder.isPending ? "Хадгалж байна…" : "Хадгалах"}
					</Button>
				</DialogFooter>
				<DialogCloseButton aria-label="Хаах" />
			</DialogContent>
		</Dialog>
	);
}
