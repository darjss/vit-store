import { useQuery } from "@tanstack/react-query";
import { debounce } from "lodash";
import {
	AlertCircle,
	Loader2,
	PackageSearch,
	Search,
	Trash2,
} from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import type { BrandType, CategoryType, ProductType } from "@/lib/types";
import { trpc } from "@/utils/trpc";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { ScrollArea } from "../ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import type { PurchaseLineState } from "./purchase-form.helpers";

type PurchaseLineEditorProps = {
	item: PurchaseLineState;
	index: number;
	products: ProductType[];
	brands: BrandType[];
	categories: CategoryType[];
	isAiMode: boolean;
	canRemove: boolean;
	onUpdateItem: (
		index: number,
		field: keyof PurchaseLineState,
		value: number | string | null | undefined,
	) => void;
	onUpdateDraft: (
		index: number,
		field: keyof NonNullable<PurchaseLineState["newProductDraft"]>,
		value: string | number | null | { url: string }[],
	) => void;
	onRemove: (index: number) => void;
};

function ItemWarnings({ warnings }: { warnings: string[] }) {
	return (
		<div className="rounded-base border border-amber-300 bg-amber-50 p-3 text-amber-800 text-sm">
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
	index,
	candidates,
	onSelect,
}: {
	index: number;
	candidates: NonNullable<PurchaseLineState["candidateMatches"]>;
	onSelect: PurchaseLineEditorProps["onUpdateItem"];
}) {
	if (candidates.length === 0) return null;

	return (
		<div className="space-y-2">
			<p className="text-muted-foreground text-sm">Санал болгосон таарц</p>
			<div className="flex flex-wrap gap-2">
				{candidates.map((candidate) => (
					<Button
						key={candidate.id}
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onSelect(index, "productId", candidate.id)}
					>
						{candidate.name}
					</Button>
				))}
			</div>
		</div>
	);
}

function DraftFields({
	item,
	index,
	brands,
	categories,
	onUpdateDraft,
}: {
	item: PurchaseLineState;
	index: number;
	brands: BrandType[];
	categories: CategoryType[];
	onUpdateDraft: PurchaseLineEditorProps["onUpdateDraft"];
}) {
	return (
		<div className="grid gap-4 md:grid-cols-2">
			<div className="space-y-2">
				<Label>Барааны нэр</Label>
				<Input
					value={item.newProductDraft?.name ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Нэр (МН)</Label>
				<Input
					value={item.newProductDraft?.name_mn ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name_mn", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Брэнд</Label>
				<Select
					value={
						item.newProductDraft?.brandId
							? String(item.newProductDraft.brandId)
							: ""
					}
					onValueChange={(value) =>
						onUpdateDraft(index, "brandId", Number(value))
					}
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
					value={
						item.newProductDraft?.categoryId
							? String(item.newProductDraft.categoryId)
							: ""
					}
					onValueChange={(value) =>
						onUpdateDraft(index, "categoryId", Number(value))
					}
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
					value={item.newProductDraft?.amount ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "amount", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Агууламж</Label>
				<Input
					value={item.newProductDraft?.potency ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "potency", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2 md:col-span-2">
				<Label>Тайлбар</Label>
				<Textarea
					value={item.newProductDraft?.description ?? ""}
					onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
						onUpdateDraft(index, "description", event.target.value)
					}
					rows={3}
				/>
			</div>
		</div>
	);
}

function ProductSearchField({
	item,
	index,
	products,
	isAiMode,
	onUpdateItem,
}: Pick<
	PurchaseLineEditorProps,
	"item" | "index" | "products" | "isAiMode" | "onUpdateItem"
>) {
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

	const { data: searchResults = [], isFetching: isSearchingProducts } =
		useQuery({
			...trpc.product.searchProductsInstant.queryOptions({
				query: debouncedProductSearch,
				limit: 10,
			}),
			staleTime: 5 * 60 * 1000,
			refetchOnWindowFocus: false,
			enabled: debouncedProductSearch.length > 0,
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
				<div className="flex items-center justify-between gap-2 rounded-base border-2 border-border bg-background px-3 py-2">
					<span className="line-clamp-1 text-sm">{selectedProduct.name}</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => onUpdateItem(index, "productId", 0)}
					>
						Солих
					</Button>
				</div>
			) : null}
			<div className="relative">
				<div className="relative">
					<Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Барааг нэрээр хайх..."
						className="pl-10"
						value={productSearch}
						onChange={handleProductSearchChange}
					/>
				</div>
				{isSearchingProducts ? (
					<div className="mt-2 flex items-center text-muted-foreground text-xs">
						<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
						Хайж байна...
					</div>
				) : null}
				{searchResults.length > 0 && productSearch ? (
					<Card className="absolute right-0 left-0 z-50 mt-1 border-2 border-border shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
						<ScrollArea className="max-h-[260px]">
							<div className="p-1">
								{searchResults.map((product) => (
									<button
										key={product.id}
										type="button"
										className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
										onClick={() => handleSelectProduct(product.id)}
									>
										{product.name}
									</button>
								))}
							</div>
						</ScrollArea>
					</Card>
				) : null}
				{debouncedProductSearch &&
				!isSearchingProducts &&
				searchResults.length === 0 ? (
					<p className="mt-2 text-muted-foreground text-xs">Бараа олдсонгүй</p>
				) : null}
			</div>
			{isAiMode ? (
				<Button
					type="button"
					variant={!item.productId ? "default" : "outline"}
					size="sm"
					onClick={() => onUpdateItem(index, "productId", 0)}
				>
					Шинэ барааны ноорог үүсгэх
				</Button>
			) : null}
		</div>
	);
}

export function PurchaseLineEditor({
	item,
	index,
	products,
	brands,
	categories,
	isAiMode,
	canRemove,
	onUpdateItem,
	onUpdateDraft,
	onRemove,
}: PurchaseLineEditorProps) {
	return (
		<div className="space-y-4 rounded-base border-2 border-border bg-card p-4">
			<div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto]">
				<div className="space-y-2">
					<ProductSearchField
						item={item}
						index={index}
						products={products}
						isAiMode={isAiMode}
						onUpdateItem={onUpdateItem}
					/>

					{item.description ? (
						<div className="rounded-base border bg-muted/20 p-2 text-sm">
							<p className="font-medium">{item.description}</p>
							{item.sourceCode ? (
								<p className="text-muted-foreground text-xs">
									Код: {item.sourceCode}
								</p>
							) : null}
							{item.expirationDate ? (
								<p className="text-muted-foreground text-xs">
									Хугацаа: {item.expirationDate}
								</p>
							) : null}
						</div>
					) : null}
				</div>

				<div className="space-y-2">
					<Label>Захиалсан тоо</Label>
					<Input
						type="number"
						min={1}
						value={item.quantityOrdered}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onUpdateItem(index, "quantityOrdered", Number(event.target.value))
						}
						required
					/>
				</div>

				<div className="space-y-2">
					<Label>Нэгжийн өртөг</Label>
					<Input
						type="number"
						min={0}
						value={item.unitCost}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onUpdateItem(index, "unitCost", Number(event.target.value))
						}
						required
					/>
				</div>

				<div className="flex items-end">
					<Button
						type="button"
						variant="outline"
						className="w-full gap-2"
						onClick={() => onRemove(index)}
						disabled={!canRemove}
					>
						<Trash2 className="h-4 w-4" />
						Устгах
					</Button>
				</div>
			</div>

			{item.warnings?.length ? <ItemWarnings warnings={item.warnings} /> : null}

			{isAiMode && !item.productId ? (
				<div className="space-y-4 rounded-base border border-border border-dashed bg-muted/20 p-4">
					<div className="flex items-center gap-2">
						<PackageSearch className="h-4 w-4" />
						<h4 className="font-medium">Шинэ барааны ноорог</h4>
					</div>

					<DraftSuggestions
						index={index}
						candidates={item.candidateMatches ?? []}
						onSelect={onUpdateItem}
					/>

					<DraftFields
						item={item}
						index={index}
						brands={brands}
						categories={categories}
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
