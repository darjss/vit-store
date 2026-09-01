import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import { AlertCircle, Loader2, PackageSearch, Search, Trash2 } from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import type { BrandType, CategoryType, ProductType } from "@/lib/types";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import type { PurchaseLineState } from "./purchase-form.helpers";

type PurchaseLineEditorProps = {
	brands: Array<BrandType>;
	canRemove: boolean;
	categories: Array<CategoryType>;
	index: number;
	isAiMode: boolean;
	item: PurchaseLineState;
	onRemove: (index: number) => void;
	onUpdateDraft: (
		index: number,
		field: keyof NonNullable<PurchaseLineState["newProductDraft"]>,
		value: string | number | null | Array<{ url: string }>,
	) => void;
	onUpdateItem: (
		index: number,
		field: keyof PurchaseLineState,
		value: number | string | null | undefined,
	) => void;
	products: Array<ProductType>;
};

function ItemWarnings({ warnings }: { warnings: Array<string> }) {
	return (
		<div className="rounded-base border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
			<div className="mb-2 flex items-center gap-2 font-medium">
				<AlertCircle className="h-4 w-4" />
				Анхааруулга шалгах
			</div>
			<ul className="space-y-1">
				{warnings.map((warning, warningIndex) => (
					<li key={`${warning}-${warningIndex}`}>{warning}</li>
				))}
			</ul>
		</div>
	);
}

function DraftSuggestions({
	candidates,
	index,
	onSelect,
}: {
	candidates: NonNullable<PurchaseLineState["candidateMatches"]>;
	index: number;
	onSelect: PurchaseLineEditorProps["onUpdateItem"];
}) {
	if (candidates.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-sm">Санал болгосон таарц</p>
			<div className="flex flex-wrap gap-2">
				{candidates.map((candidate) => (
					<Button
						key={candidate.id}
						onClick={() => onSelect(index, "productId", candidate.id)}
						size="sm"
						type="button"
						variant="outline"
					>
						{candidate.name}
					</Button>
				))}
			</div>
		</div>
	);
}

function DraftFields({
	brands,
	categories,
	index,
	item,
	onUpdateDraft,
}: {
	brands: Array<BrandType>;
	categories: Array<CategoryType>;
	index: number;
	item: PurchaseLineState;
	onUpdateDraft: PurchaseLineEditorProps["onUpdateDraft"];
}) {
	return (
		<div className="grid gap-4 md:grid-cols-2">
			<div className="space-y-2">
				<Label>Барааны нэр</Label>
				<Input
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name", event.target.value)
					}
					value={item.newProductDraft?.name ?? ""}
				/>
			</div>
			<div className="space-y-2">
				<Label>Нэр (МН)</Label>
				<Input
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name_mn", event.target.value)
					}
					value={item.newProductDraft?.name_mn ?? ""}
				/>
			</div>
			<div className="space-y-2">
				<Label>Брэнд</Label>
				<Select
					onValueChange={(value) => onUpdateDraft(index, "brandId", Number(value))}
					value={item.newProductDraft?.brandId ? String(item.newProductDraft.brandId) : ""}
				>
					<SelectTrigger>
						<SelectValue placeholder="Брэнд сонгох" />
					</SelectTrigger>
					<SelectContent>
						{brands.map((brand) => (
							<SelectItem key={brand.id} value={String(brand.id)}>
								{brand.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-2">
				<Label>Ангилал</Label>
				<Select
					onValueChange={(value) => onUpdateDraft(index, "categoryId", Number(value))}
					value={item.newProductDraft?.categoryId ? String(item.newProductDraft.categoryId) : ""}
				>
					<SelectTrigger>
						<SelectValue placeholder="Ангилал сонгох" />
					</SelectTrigger>
					<SelectContent>
						{categories.map((category) => (
							<SelectItem key={category.id} value={String(category.id)}>
								{category.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<div className="space-y-2">
				<Label>Хэмжээ</Label>
				<Input
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "amount", event.target.value)
					}
					value={item.newProductDraft?.amount ?? ""}
				/>
			</div>
			<div className="space-y-2">
				<Label>Агууламж</Label>
				<Input
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "potency", event.target.value)
					}
					value={item.newProductDraft?.potency ?? ""}
				/>
			</div>
			<div className="space-y-2 md:col-span-2">
				<Label>Тайлбар</Label>
				<Textarea
					onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
						onUpdateDraft(index, "description", event.target.value)
					}
					rows={3}
					value={item.newProductDraft?.description ?? ""}
				/>
			</div>
		</div>
	);
}

function ProductSearchField({
	index,
	isAiMode,
	item,
	onUpdateItem,
	products,
}: Pick<PurchaseLineEditorProps, "item" | "index" | "products" | "isAiMode" | "onUpdateItem">) {
	const [productSearch, setProductSearch] = useState("");
	const [debouncedProductSearch, setDebouncedProductSearch] = useState("");

	const selectedProduct = useMemo(
		() => products.find((product) => product.id === item.productId),
		[products, item.productId],
	);

	const debouncedSearch = useCallback(
		debounce((value: string) => {
			setDebouncedProductSearch(value.trim());
		}, 300),
		[],
	);

	const { data: searchResults = [], isFetching: isSearchingProducts } = useQuery({
		...trpc.product.searchProductsInstant.queryOptions({
			limit: 10,
			query: debouncedProductSearch,
		}),
		enabled: debouncedProductSearch.length > 0,
		refetchOnWindowFocus: false,
		staleTime: 5 * 60 * 1000,
	});

	const handleProductSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setProductSearch(value);
		debouncedSearch(value);
	};

	const handleSelectProduct = (productId: number) => {
		onUpdateItem(index, "productId", productId);
		setProductSearch("");
		setDebouncedProductSearch("");
	};

	return (
		<div className="space-y-2">
			<Label>Бараа</Label>
			{selectedProduct ? (
				<div className="rounded-base border-border bg-background flex items-center justify-between gap-2 border-2 px-3 py-2">
					<span className="line-clamp-1 text-sm">{selectedProduct.name}</span>
					<Button
						onClick={() => onUpdateItem(index, "productId", 0)}
						size="sm"
						type="button"
						variant="outline"
					>
						Солих
					</Button>
				</div>
			) : null}
			<div className="relative">
				<div className="relative">
					<Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
					<Input
						className="pl-10"
						onChange={handleProductSearchChange}
						placeholder="Барааг нэрээр хайх..."
						value={productSearch}
					/>
				</div>
				{isSearchingProducts ? (
					<div className="text-muted-foreground mt-2 flex items-center text-xs">
						<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
						Хайж байна...
					</div>
				) : null}
				{searchResults.length > 0 && productSearch ? (
					<Card className="border-border absolute right-0 left-0 z-50 mt-1 border-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
						<ScrollArea className="max-h-[260px]">
							<div className="p-1">
								{searchResults.map((product) => (
									<button
										className="hover:bg-muted w-full rounded-md px-3 py-2 text-left text-sm"
										key={product.id}
										onClick={() => handleSelectProduct(product.id)}
										type="button"
									>
										{product.name}
									</button>
								))}
							</div>
						</ScrollArea>
					</Card>
				) : null}
				{debouncedProductSearch && !isSearchingProducts && searchResults.length === 0 ? (
					<p className="text-muted-foreground mt-2 text-xs">Бараа олдсонгүй</p>
				) : null}
			</div>
			{isAiMode ? (
				<Button
					onClick={() => onUpdateItem(index, "productId", 0)}
					size="sm"
					type="button"
					variant={!item.productId ? "default" : "outline"}
				>
					Шинэ барааны ноорог үүсгэх
				</Button>
			) : null}
		</div>
	);
}

export function PurchaseLineEditor({
	brands,
	canRemove,
	categories,
	index,
	isAiMode,
	item,
	onRemove,
	onUpdateDraft,
	onUpdateItem,
	products,
}: PurchaseLineEditorProps) {
	return (
		<div className="rounded-base border-border bg-card space-y-4 border-2 p-4">
			<div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]">
				<div className="space-y-2">
					<ProductSearchField
						index={index}
						isAiMode={isAiMode}
						item={item}
						onUpdateItem={onUpdateItem}
						products={products}
					/>

					{item.description ? (
						<div className="rounded-base bg-muted/20 border p-2 text-sm">
							<p className="font-medium">{item.description}</p>
							{item.sourceCode ? (
								<p className="text-muted-foreground text-xs">Код: {item.sourceCode}</p>
							) : null}
							{item.expirationDate ? (
								<p className="text-muted-foreground text-xs">Хугацаа: {item.expirationDate}</p>
							) : null}
						</div>
					) : null}
				</div>

				<div className="space-y-2">
					<Label>Захиалсан тоо</Label>
					<Input
						min={1}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onUpdateItem(index, "quantityOrdered", Number(event.target.value))
						}
						required
						type="number"
						value={item.quantityOrdered}
					/>
				</div>

				<div className="space-y-2">
					<Label>Нэгжийн өртөг</Label>
					<Input
						min={0}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onUpdateItem(index, "unitCost", Number(event.target.value))
						}
						required
						type="number"
						value={item.unitCost}
					/>
				</div>

				<div className="flex items-end">
					<Button
						className="w-full gap-2"
						disabled={!canRemove}
						onClick={() => onRemove(index)}
						type="button"
						variant="outline"
					>
						<Trash2 className="h-4 w-4" />
						Устгах
					</Button>
				</div>
			</div>

			{item.warnings?.length ? <ItemWarnings warnings={item.warnings} /> : null}

			{isAiMode && !item.productId ? (
				<div className="rounded-base border-border bg-muted/20 space-y-4 border border-dashed p-4">
					<div className="flex items-center gap-2">
						<PackageSearch className="h-4 w-4" />
						<h4 className="font-medium">Шинэ барааны ноорог</h4>
					</div>

					<DraftSuggestions
						candidates={item.candidateMatches ?? []}
						index={index}
						onSelect={onUpdateItem}
					/>

					<DraftFields
						brands={brands}
						categories={categories}
						index={index}
						item={item}
						onUpdateDraft={onUpdateDraft}
					/>
				</div>
			) : null}

			{typeof item.quantityReceived === "number" ? (
				<p className="text-muted-foreground text-sm">
					Хүлээн авсан: {item.quantityReceived} / {item.quantityOrdered}
				</p>
			) : null}
		</div>
	);
}
