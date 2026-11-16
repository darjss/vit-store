import { Loader2, Pencil } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useEditableField } from "@/hooks/use-editable-field";

type FieldType = "text" | "number" | "textarea" | "select" | "month";
type FieldOption = { label: string; value: string };

type EditableFieldBaseProps<T> = {
	/** Buttons shown at the right of the row, outside the tap-to-edit area. */
	actions?: React.ReactNode;
	format?: (value: T) => string;
	isLoading?: boolean;
	label?: string;
	// Mutations resolve with their response object; the field only waits for it.
	onSave: (next: T) => Promise<object | void> | void;
	options?: Array<FieldOption>;
	renderDisplay?: (value: T) => React.ReactNode;
	type?: FieldType;
	value: T;
};

type EditableFieldProps<T> = EditableFieldBaseProps<T> & {
	parse?: (raw: string) => T;
};

// One list row. Tap it to edit in place; the label stays above the value.
export function EditableField<T>({
	actions,
	format,
	isLoading: externalLoading = false,
	label,
	onSave,
	options,
	parse,
	renderDisplay,
	type = "text",
	value,
}: EditableFieldProps<T>) {
	const { cancel, isEditing, isSaving, save, setTempValue, start, tempValue } = useEditableField<T>(
		{
			initialValue: value,
			onSave,
		},
	);

	const applyRawValue = (raw: string) => {
		if (parse) {
			setTempValue(parse(raw));
			return;
		}
		// SAFETY: omitted `parse` is only valid when T is string (conditional prop type).
		setTempValue(raw as T);
	};

	if (!isEditing) {
		const display = renderDisplay
			? renderDisplay(value)
			: format
				? format(value)
				: String(value ?? "");
		return (
			<FieldRow actions={actions} display={display} label={label} onStart={() => start(value)} />
		);
	}

	return (
		<FieldEditor
			isLoading={isSaving || externalLoading}
			label={label}
			onCancel={cancel}
			onChange={applyRawValue}
			onSave={() => void save()}
			options={options}
			type={type}
			value={String(tempValue ?? "")}
		/>
	);
}

function FieldRow({
	actions,
	display,
	label,
	onStart,
}: {
	actions?: React.ReactNode;
	display: React.ReactNode;
	label?: string;
	onStart: () => void;
}) {
	return (
		<div className="flex items-center">
			<button
				className="active:bg-muted hover:bg-muted/50 flex min-h-12 min-w-0 flex-1 items-center gap-3 px-4 py-2 text-left"
				onClick={onStart}
				type="button"
			>
				<div className="min-w-0 flex-1">
					{label && <p className="text-muted-foreground text-xs">{label}</p>}
					<div className="text-[15px] leading-snug break-words">
						{display === "" ? <span className="text-muted-foreground">Хоосон</span> : display}
					</div>
				</div>
				<Pencil className="text-muted-foreground size-3.5 shrink-0 opacity-60" />
			</button>
			{actions && <div className="flex shrink-0 items-center pr-2">{actions}</div>}
		</div>
	);
}

function FieldEditor({
	isLoading,
	label,
	onCancel,
	onChange,
	onSave,
	options,
	type,
	value,
}: {
	isLoading: boolean;
	label?: string;
	onCancel: () => void;
	onChange: (raw: string) => void;
	onSave: () => void;
	options?: Array<FieldOption>;
	type: FieldType;
	value: string;
}) {
	return (
		<div className="bg-muted/40 space-y-2 px-4 py-3">
			{label && <p className="text-muted-foreground text-xs">{label}</p>}
			{type === "textarea" ? (
				<Textarea
					autoFocus
					className="min-h-24 bg-white text-[15px] shadow-none"
					disabled={isLoading}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
					rows={4}
					value={value}
				/>
			) : type === "select" ? (
				<Select disabled={isLoading} onValueChange={onChange} value={value}>
					<SelectTrigger className="h-11 w-full bg-white text-[15px] shadow-none">
						<SelectValue placeholder="Сонголт хийх" />
					</SelectTrigger>
					<SelectContent>
						{options?.map((option) => (
							<SelectItem key={option.value} value={option.value}>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : (
				<Input
					autoFocus
					className="h-11 bg-white text-[15px] shadow-none"
					disabled={isLoading}
					inputMode={type === "number" ? "decimal" : undefined}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							onSave();
						}
						if (e.key === "Escape") {
							onCancel();
						}
					}}
					step={type === "number" ? "0.01" : undefined}
					type={type}
					value={value}
				/>
			)}
			<div className="flex gap-2">
				<Button className="h-10 flex-1" disabled={isLoading} onClick={onSave}>
					{isLoading ? <Loader2 className="size-4 animate-spin" /> : "Хадгалах"}
				</Button>
				<Button className="h-10 px-5" disabled={isLoading} onClick={onCancel} variant="outline">
					Болих
				</Button>
			</div>
		</div>
	);
}
