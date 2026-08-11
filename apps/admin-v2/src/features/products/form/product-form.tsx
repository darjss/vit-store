import { AltArrowDownIcon } from "@solar-icons/solid/linear/alt-arrow-down";
import { AltArrowUpIcon } from "@solar-icons/solid/linear/alt-arrow-up";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import {
	createMutation,
	createQuery,
	useQueryClient,
} from "@tanstack/solid-query";
import { productTagSuggestions } from "@vit/shared";
import { addProductSchema } from "@vit/shared/schema";
import {
	Button,
	Field,
	FormSection,
	InlineAlert,
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	showToast,
	TextArea,
} from "@vit/ui";
import { createEffect, createSignal, For, Show } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import * as v from "valibot";

import {
	applyProductToCaches,
	invalidateProductLists,
	invalidateProductsForWrite,
} from "../cache";
import { productErrorToMessage } from "../errors";
import {
	addProductMutationOptions,
	updateProductMutationOptions,
} from "../mutations";
import { brandsQueryOptions, categoriesQueryOptions } from "../queries";
import {
	type BrandOption,
	type CategoryOption,
	PRODUCT_STATUS_OPTIONS,
	type ProductStatus,
} from "../types";
import {
	type ProductFormDraft,
	type ProductFormProduct,
	productFormDefaults,
	productFormIsDirty,
	productFormIssueErrors,
	productFormToInput,
} from "./model";
import { StringListField } from "./string-list";
import { UploadButton } from "./upload-button";

interface ProductFormProps {
	product?: ProductFormProduct;
	onSaved: () => void;
	/** Called whenever the draft diverges from (or returns to) the baseline. */
	onDirtyChange?: (dirty: boolean) => void;
}

const parseNonNegInt = (value: string) => {
	const n = Number.parseInt(value, 10);
	return Number.isNaN(n) ? 0 : Math.max(0, n);
};

export function ProductForm(props: ProductFormProps) {
	const queryClient = useQueryClient();
	const brandsQuery = createQuery(() => brandsQueryOptions());
	const categoriesQuery = createQuery(() => categoriesQueryOptions());

	const productId = () => props.product?.id;
	const isEditing = () => productId() != null;

	const selectedBrand = () =>
		(brandsQuery.data ?? []).find(
			(brand) => brand.id === (draft.brandId ? Number(draft.brandId) : -1),
		) ?? null;
	const selectedCategory = () =>
		(categoriesQuery.data ?? []).find(
			(category) =>
				category.id === (draft.categoryId ? Number(draft.categoryId) : -1),
		) ?? null;
	const selectedStatus = () =>
		PRODUCT_STATUS_OPTIONS.find((option) => option.value === draft.status) ??
		null;

	const [baseline, setBaseline] = createSignal<ProductFormDraft>(
		productFormDefaults(props.product),
	);
	const [draft, setDraft] = createStore<ProductFormDraft>(baseline());
	const [fieldErrors, setFieldErrors] = createStore<Record<string, string>>({});
	const [submitError, setSubmitError] = createSignal<string>("");
	const [advancedOpen, setAdvancedOpen] = createSignal(false);

	createEffect(() => {
		props.onDirtyChange?.(productFormIsDirty(draft, baseline()));
	});

	const resetDraft = (product?: ProductFormProduct) => {
		const next = productFormDefaults(product);
		setBaseline(next);
		setDraft(reconcile(next));
		setFieldErrors({});
		setSubmitError("");
	};

	const addMutation = createMutation(() => ({
		...addProductMutationOptions(),
		onSuccess: (res) => {
			if (res.product) {
				applyProductToCaches(queryClient, res.product);
			} else {
				void invalidateProductLists(queryClient);
			}
			resetDraft(res.product ?? props.product);
			showToast({ title: "Бүтээгдэхүүн нэмэгдлээ", variant: "success" });
			props.onSaved();
		},
		onError: (error) => {
			setSubmitError(
				productErrorToMessage(error, "Бүтээгдэхүүн нэмэх боломжгүй"),
			);
		},
	}));

	const updateMutation = createMutation(() => ({
		...updateProductMutationOptions(),
		onSuccess: (res) => {
			if (res.product) {
				applyProductToCaches(queryClient, res.product);
				// Name/slug may change — search results must agree too.
				void invalidateProductLists(queryClient);
			} else {
				void invalidateProductsForWrite(queryClient, productId());
			}
			resetDraft(res.product ?? props.product);
			showToast({ title: "Бүтээгдэхүүн шинэчлэгдлээ", variant: "success" });
			props.onSaved();
		},
		onError: (error) => {
			setSubmitError(
				productErrorToMessage(error, "Бүтээгдэхүүн шинэчлэх боломжгүй"),
			);
		},
	}));

	const pending = () => addMutation.isPending || updateMutation.isPending;

	const onSubmit = () => {
		if (pending()) return;
		const input = productFormToInput(draft);
		// updateProductSchema is addProductSchema plus a required id, so the
		// same validation covers both modes (the id is appended on submit).
		const result = v.safeParse(addProductSchema, input);
		if (!result.success) {
			setFieldErrors(productFormIssueErrors(result.issues));
			setSubmitError("");
			return;
		}
		setFieldErrors({});
		setSubmitError("");
		const id = productId();
		if (isEditing() && id != null) {
			updateMutation.mutate({ ...input, id });
		} else {
			addMutation.mutate(input);
		}
	};

	const removeImage = (index: number) => {
		setDraft("images", (images) => images.filter((_, i) => i !== index));
	};

	return (
		<form
			class="space-y-6"
			onSubmit={(event) => {
				event.preventDefault();
				onSubmit();
			}}
		>
			<Show when={submitError()}>
				<InlineAlert tone="error" title="Хадгалах боломжгүй">
					{submitError()}
				</InlineAlert>
			</Show>

			<FormSection title="Үндсэн мэдээлэл">
				<Field label="Бүтээгдэхүүний нэр (EN)" error={fieldErrors.name}>
					<Input
						placeholder="Жишээ нь: Vitamin D3 2000 IU"
						value={draft.name}
						onInput={(event) => setDraft("name", event.currentTarget.value)}
					/>
				</Field>
				<Field label="Нэр (MN)">
					<Input
						placeholder="Монгол нэр"
						value={draft.name_mn}
						onInput={(event) => setDraft("name_mn", event.currentTarget.value)}
					/>
				</Field>
				<Field label="Тайлбар" error={fieldErrors.description}>
					<TextArea
						placeholder="Бүтээгдэхүүний тайлбар"
						value={draft.description}
						onInput={(event) =>
							setDraft("description", event.currentTarget.value)
						}
						class="min-h-28"
					/>
				</Field>
				<Field label="Брэнд" error={fieldErrors.brandId}>
					<Select
						options={brandsQuery.data ?? []}
						optionValue={(brand: BrandOption) => brand.id}
						optionTextValue={(brand: BrandOption) => brand.name}
						itemComponent={(itemProps) => (
							<SelectItem item={itemProps.item} class="relative">
								{itemProps.item.rawValue.name}
							</SelectItem>
						)}
						value={selectedBrand()}
						onChange={(value) =>
							setDraft("brandId", value ? String(value.id) : "")
						}
						disabled={brandsQuery.isPending}
					>
						<SelectTrigger>
							<SelectValue<BrandOption>>
								{(state) => state.selectedOption()?.name ?? "Брэнд сонгох"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				</Field>
				<Field label="Ангилал" error={fieldErrors.categoryId}>
					<Select
						options={categoriesQuery.data ?? []}
						optionValue={(category: CategoryOption) => category.id}
						optionTextValue={(category: CategoryOption) => category.name}
						itemComponent={(itemProps) => (
							<SelectItem item={itemProps.item} class="relative">
								{itemProps.item.rawValue.name}
							</SelectItem>
						)}
						value={selectedCategory()}
						onChange={(value) =>
							setDraft("categoryId", value ? String(value.id) : "")
						}
						disabled={categoriesQuery.isPending}
					>
						<SelectTrigger>
							<SelectValue<CategoryOption>>
								{(state) => state.selectedOption()?.name ?? "Ангилал сонгох"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				</Field>
				<Field label="Төлөв" error={fieldErrors.status}>
					<Select
						options={PRODUCT_STATUS_OPTIONS}
						optionValue={(option) => option.value}
						optionTextValue={(option) => option.label}
						itemComponent={(itemProps) => (
							<SelectItem item={itemProps.item} class="relative">
								{itemProps.item.rawValue.label}
							</SelectItem>
						)}
						value={selectedStatus()}
						onChange={(value) => value && setDraft("status", value.value)}
					>
						<SelectTrigger>
							<SelectValue<{ value: ProductStatus; label: string }>>
								{(state) => state.selectedOption()?.label ?? "Төлөв сонгох"}
							</SelectValue>
						</SelectTrigger>
						<SelectContent />
					</Select>
				</Field>
			</FormSection>

			<FormSection title="Үнэ ба үлдэгдэл">
				<Field label="Үнэ (₮)" error={fieldErrors.price}>
					<Input
						type="number"
						min="0"
						step="1000"
						placeholder="Үнэ оруулах"
						value={draft.price}
						onInput={(event) =>
							setDraft("price", parseNonNegInt(event.currentTarget.value))
						}
					/>
				</Field>
				<Field label="Үлдэгдэл" error={fieldErrors.stock}>
					<Input
						type="number"
						min="0"
						placeholder="Үлдэгдэл тоо"
						value={draft.stock}
						onInput={(event) =>
							setDraft("stock", parseNonNegInt(event.currentTarget.value))
						}
					/>
				</Field>
				<Field
					label="Дуусах хугацаа (сар/жил)"
					error={fieldErrors.expirationDate}
				>
					<Input
						type="month"
						value={draft.expirationDate}
						onInput={(event) =>
							setDraft("expirationDate", event.currentTarget.value)
						}
					/>
				</Field>
				<Field label="Хүч" error={fieldErrors.potency}>
					<Input
						placeholder="Жишээ нь: 100mg"
						value={draft.potency}
						onInput={(event) => setDraft("potency", event.currentTarget.value)}
					/>
				</Field>
				<Field label="Хэмжээ" error={fieldErrors.amount}>
					<Input
						placeholder="Жишээ нь: 30 капсул"
						value={draft.amount}
						onInput={(event) => setDraft("amount", event.currentTarget.value)}
					/>
				</Field>
				<Field label="Өдрийн тун" error={fieldErrors.dailyIntake}>
					<Input
						type="number"
						min="1"
						placeholder="Өдөрт хэрэглэх хэмжээ"
						value={draft.dailyIntake}
						onInput={(event) =>
							setDraft("dailyIntake", parseNonNegInt(event.currentTarget.value))
						}
					/>
				</Field>
			</FormSection>

			<FormSection
				title="Зураг"
				description="Эхний зураг дэлгүүрт үндсэн зураг болно."
			>
				<Show when={draft.images.length > 0}>
					<div class="grid grid-cols-3 gap-2 sm:grid-cols-4">
						<For each={draft.images}>
							{(image, index) => (
								<div class="relative aspect-square overflow-hidden rounded-ui border border-rule bg-surface-2">
									<img
										src={image.url}
										alt={`Бүтээгдэхүүний зураг ${index() + 1}`}
										class="h-full w-full object-cover"
										loading="lazy"
									/>
									<Show when={index() === 0}>
										<span class="absolute bottom-0 left-0 bg-butter px-2 py-0.5 font-bold text-butter-ink text-xs">
											Үндсэн
										</span>
									</Show>
									<button
										type="button"
										aria-label={`Зураг ${index() + 1} устгах`}
										onClick={() => removeImage(index())}
										class="absolute top-1 right-1 grid size-8 place-items-center rounded-md bg-ink/60 text-white transition-colors hover:bg-ink"
									>
										<CloseCircleIcon class="size-4" />
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>
				<Show when={fieldErrors.images}>
					<p class="text-coral-ink text-sm">{fieldErrors.images}</p>
				</Show>
				<UploadButton
					onUploaded={(url) =>
						setDraft("images", (images) => [...images, { url }])
					}
				/>
			</FormSection>

			<FormSection title="Нэмэлт мэдээлэл">
				<button
					type="button"
					onClick={() => setAdvancedOpen((open) => !open)}
					class="flex min-h-11 items-center justify-between gap-2 rounded-ui border border-rule px-4 font-bold text-ink text-sm transition-colors hover:bg-surface-2"
					aria-expanded={advancedOpen()}
				>
					Нэмэлт мэдээлэл (AI)
					{advancedOpen() ? <AltArrowUpIcon /> : <AltArrowDownIcon />}
				</button>
				<Show when={advancedOpen()}>
					<div class="grid gap-4">
						<Field label="Жин (грамм)">
							<Input
								type="number"
								min="0"
								placeholder="Жин оруулах"
								value={draft.weightGrams}
								onInput={(event) =>
									setDraft(
										"weightGrams",
										parseNonNegInt(event.currentTarget.value),
									)
								}
							/>
						</Field>
						<div class="grid gap-1.5">
							<p class="font-bold text-ink text-sm">Найрлага</p>
							<StringListField
								label="Найрлага"
								placeholder="Найрлага нэмэх…"
								values={draft.ingredients}
								onAdd={(value) =>
									setDraft("ingredients", (list) => [...list, value])
								}
								onRemove={(index) =>
									setDraft("ingredients", (list) =>
										list.filter((_, i) => i !== index),
									)
								}
							/>
						</div>
						<div class="grid gap-1.5">
							<p class="font-bold text-ink text-sm">Таг</p>
							<StringListField
								label="Таг"
								placeholder="Таг нэмэх…"
								values={draft.tags}
								suggestions={[...productTagSuggestions]}
								onAdd={(value) => setDraft("tags", (list) => [...list, value])}
								onRemove={(index) =>
									setDraft("tags", (list) => list.filter((_, i) => i !== index))
								}
							/>
						</div>
						<Field label="SEO гарчиг">
							<Input
								placeholder="SEO гарчиг (60 тэмдэгт хүртэл)"
								value={draft.seoTitle}
								onInput={(event) =>
									setDraft("seoTitle", event.currentTarget.value)
								}
							/>
							<p class="text-ink-2 text-xs">{draft.seoTitle.length} / 60</p>
						</Field>
						<Field label="SEO тайлбар">
							<TextArea
								placeholder="SEO тайлбар (160 тэмдэгт хүртэл)"
								value={draft.seoDescription}
								onInput={(event) =>
									setDraft("seoDescription", event.currentTarget.value)
								}
								class="min-h-20"
							/>
							<p class="text-ink-2 text-xs">
								{draft.seoDescription.length} / 160
							</p>
						</Field>
					</div>
				</Show>
			</FormSection>

			<Button type="submit" class="w-full" loading={pending()}>
				{isEditing() ? "Шинэчлэх" : "Бүтээгдэхүүн нэмэх"}
			</Button>
		</form>
	);
}
