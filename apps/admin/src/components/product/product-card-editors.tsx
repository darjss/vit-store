import { Edit } from "lucide-react";
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
					const next =
						e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
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
			<Button
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={(e) => {
					e.stopPropagation();
					onSave();
				}}
				disabled={isPending}
			>
				Хадг
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={(e) => {
					e.stopPropagation();
					onValueChange(stock);
					onCancel();
				}}
				disabled={isPending}
			>
				Цуц
			</Button>
		</div>
	);
}

export function ProductPriceEditor({
	isEditing,
	price,
	value,
	isPending,
	onValueChange,
	onEdit,
	onCancel,
	onSave,
}: {
	isEditing: boolean;
	price: number;
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
				<Edit className="mr-1 h-4 w-4" />₮{price.toLocaleString()}
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
					const next =
						e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
					onValueChange(Math.max(0, next));
				}}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") onSave();
					if (e.key === "Escape") {
						onValueChange(price);
						onCancel();
					}
				}}
				className="h-8 w-24 border-2 border-border text-center text-sm"
				disabled={isPending}
			/>
			<Button
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={(e) => {
					e.stopPropagation();
					onSave();
				}}
				disabled={isPending}
			>
				Хадг
			</Button>
			<Button
				variant="outline"
				size="sm"
				className="h-8 px-2 text-xs"
				onClick={(e) => {
					e.stopPropagation();
					onValueChange(price);
					onCancel();
				}}
				disabled={isPending}
			>
				Цуц
			</Button>
		</div>
	);
}
