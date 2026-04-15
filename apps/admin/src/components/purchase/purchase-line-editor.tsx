import {
	AlertCircle,
	PackageSearch,
	Trash2,
} from "lucide-react";
import type { ChangeEvent } from "react";
import type { BrandType, CategoryType, ProductType } from "@/lib/types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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
				Review warnings
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
			<p className="text-muted-foreground text-sm">Suggested existing matches</p>
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
				<Label>Product name</Label>
				<Input
					value={item.newProductDraft?.name ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Name (MN)</Label>
				<Input
					value={item.newProductDraft?.name_mn ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "name_mn", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Brand</Label>
				<Select
					value={
						item.newProductDraft?.brandId
							? String(item.newProductDraft.brandId)
							: ""
					}
					onValueChange={(value) => onUpdateDraft(index, "brandId", Number(value))}
				>
					<SelectTrigger>
						<SelectValue placeholder="Choose brand" />
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
				<Label>Category</Label>
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
						<SelectValue placeholder="Choose category" />
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
				<Label>Amount</Label>
				<Input
					value={item.newProductDraft?.amount ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "amount", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2">
				<Label>Potency</Label>
				<Input
					value={item.newProductDraft?.potency ?? ""}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						onUpdateDraft(index, "potency", event.target.value)
					}
				/>
			</div>
			<div className="space-y-2 md:col-span-2">
				<Label>Description</Label>
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
					<Label>Product</Label>
					<Select
						value={item.productId ? String(item.productId) : "new"}
						onValueChange={(value) =>
							onUpdateItem(index, "productId", value === "new" ? 0 : Number(value))
						}
					>
						<SelectTrigger>
							<SelectValue placeholder="Choose a product" />
						</SelectTrigger>
						<SelectContent>
							{isAiMode ? (
								<SelectItem value="new">Create new product draft</SelectItem>
							) : null}
							{products.map((product) => (
								<SelectItem key={product.id} value={String(product.id)}>
									{product.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					{item.description ? (
						<div className="rounded-base border bg-muted/20 p-2 text-sm">
							<p className="font-medium">{item.description}</p>
							{item.sourceCode ? (
								<p className="text-muted-foreground text-xs">
									Code: {item.sourceCode}
								</p>
							) : null}
							{item.expirationDate ? (
								<p className="text-muted-foreground text-xs">
									Exp: {item.expirationDate}
								</p>
							) : null}
						</div>
					) : null}
				</div>

				<div className="space-y-2">
					<Label>Qty ordered</Label>
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
					<Label>Unit cost</Label>
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
						Remove
					</Button>
				</div>
			</div>

			{item.warnings?.length ? <ItemWarnings warnings={item.warnings} /> : null}

			{isAiMode && !item.productId ? (
				<div className="space-y-4 rounded-base border border-border border-dashed bg-muted/20 p-4">
					<div className="flex items-center gap-2">
						<PackageSearch className="h-4 w-4" />
						<h4 className="font-medium">New product draft</h4>
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
					Received: {item.quantityReceived} / {item.quantityOrdered}
				</p>
			) : null}
		</div>
	);
}
