import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProductStockEditor({
	isEditing,
	isPending,
	onCancel,
	onEdit,
	onSave,
	onValueChange,
	stock,
	value,
}: {
	isEditing: boolean;
	isPending: boolean;
	onCancel: () => void;
	onEdit: () => void;
	onSave: () => void;
	onValueChange: (value: number) => void;
	stock: number;
	value: number;
}) {
	if (!isEditing) {
		return (
			<Button
				className="border-border h-8 border-2 px-3 text-sm"
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
				size="sm"
				variant="secondary"
			>
				<Edit className="mr-1 h-4 w-4" />
				үлдэгдэл засах
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<Input
				className="border-border h-8 w-20 border-2 text-center text-sm"
				disabled={isPending}
				min="0"
				onChange={(e) => {
					const next = e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
					onValueChange(Math.max(0, next));
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") {
						onSave();
					}
					if (e.key === "Escape") {
						onValueChange(stock);
						onCancel();
					}
				}}
				type="number"
				value={value}
			/>
			<Button
				className="h-8 px-2 text-xs"
				disabled={isPending}
				onClick={(e) => {
					e.stopPropagation();
					onSave();
				}}
				size="sm"
			>
				Хадг
			</Button>
			<Button
				className="h-8 px-2 text-xs"
				disabled={isPending}
				onClick={(e) => {
					e.stopPropagation();
					onValueChange(stock);
					onCancel();
				}}
				size="sm"
				variant="outline"
			>
				Цуц
			</Button>
		</div>
	);
}

export function ProductPriceEditor({
	isEditing,
	isPending,
	onCancel,
	onEdit,
	onSave,
	onValueChange,
	price,
	value,
}: {
	isEditing: boolean;
	isPending: boolean;
	onCancel: () => void;
	onEdit: () => void;
	onSave: () => void;
	onValueChange: (value: number) => void;
	price: number;
	value: number;
}) {
	if (!isEditing) {
		return (
			<Button
				className="border-border h-8 border-2 px-3 text-sm"
				onClick={(e) => {
					e.stopPropagation();
					onEdit();
				}}
				size="sm"
				variant="secondary"
			>
				<Edit className="mr-1 h-4 w-4" />₮{price.toLocaleString()}
			</Button>
		);
	}

	return (
		<div className="flex items-center gap-1">
			<Input
				className="border-border h-8 w-24 border-2 text-center text-sm"
				disabled={isPending}
				min="0"
				onChange={(e) => {
					const next = e.target.value === "" ? 0 : Number.parseInt(e.target.value, 10);
					onValueChange(Math.max(0, next));
				}}
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === "Enter") {
						onSave();
					}
					if (e.key === "Escape") {
						onValueChange(price);
						onCancel();
					}
				}}
				type="number"
				value={value}
			/>
			<Button
				className="h-8 px-2 text-xs"
				disabled={isPending}
				onClick={(e) => {
					e.stopPropagation();
					onSave();
				}}
				size="sm"
			>
				Хадг
			</Button>
			<Button
				className="h-8 px-2 text-xs"
				disabled={isPending}
				onClick={(e) => {
					e.stopPropagation();
					onValueChange(price);
					onCancel();
				}}
				size="sm"
				variant="outline"
			>
				Цуц
			</Button>
		</div>
	);
}
