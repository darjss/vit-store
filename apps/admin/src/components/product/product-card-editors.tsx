import { Edit } from "lucide-react";
import { formatExpirationMonthYear } from "@vit/shared/domain/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductStockEditor({
	isEditing,
	stock,
	value,
	isPending,
	onValueChange,
	onEdit,
	onCancel,
	onSave,
}: {
	isEditing: boolean;
	stock: number;
	value: number;
	isPending: boolean;
	onValueChange: (value: number) => void;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
}) {
	if (!isEditing) {
		return (
			<Button
				variant="secondary"
				size="sm"
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
				className="h-8 border-2 border-border px-3 text-sm"
			>
				<Edit className="mr-1 h-4 w-4" />
				үлдэгдэл засах
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<Input
				type="number"
				min="0"
				value={value}
				onClick={(e) => e.stopPropagation()}
				onChange={(e) => {
					const next = e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
					onValueChange(Math.max(0, next));
				}}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") onSave();
					if (e.key === "Escape") {
						onValueChange(stock);
						onCancel();
					}
				}}
				className="h-8 w-20 border-2 border-border text-center text-sm"
				disabled={isPending}
			/>
			<Button size="sm" className="h-8 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onSave(); }} disabled={isPending}>Хадг</Button>
			<Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onValueChange(stock); onCancel(); }} disabled={isPending}>Цуц</Button>
		</div>
	);
}

export function ProductExpirationEditor({
	isEditing,
	expirationDate,
	value,
	isPending,
	onValueChange,
	onEdit,
	onCancel,
	onSave,
}: {
	isEditing: boolean;
	expirationDate?: string | null;
	value: string;
	isPending: boolean;
	onValueChange: (value: string) => void;
	onEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
}) {
	if (!isEditing) {
		return (
			<Button
				variant="secondary"
				size="sm"
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
				className="hidden h-8 border-2 border-border px-3 text-sm sm:inline-flex"
			>
				<Edit className="mr-1 h-4 w-4" />
				{formatExpirationMonthYear(expirationDate)}
			</Button>
		);
	}

	return (
		<div className="hidden items-center gap-1 sm:flex">
			<Input
				type="month"
				value={value}
				onClick={(e) => e.stopPropagation()}
				onChange={(e) => onValueChange(e.target.value)}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") onSave();
					if (e.key === "Escape") {
						onValueChange(expirationDate ?? "");
						onCancel();
					}
				}}
				className="h-8 w-36 border-2 border-border text-sm"
				disabled={isPending}
			/>
			<Button size="sm" className="h-8 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onSave(); }} disabled={isPending}>Хадг</Button>
			<Button variant="outline" size="sm" className="h-8 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onValueChange(expirationDate ?? ""); onCancel(); }} disabled={isPending}>Цуц</Button>
		</div>
	);
}
