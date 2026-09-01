import { Check, Edit2, Loader2, X } from "lucide-react";
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

type EditableFieldBaseProps<T> = {
	className?: string;
	format?: (value: T) => string;
	isLoading?: boolean;
	label?: string;
	onSave: (next: T) => void | Promise<void>;
	options?: Array<{ label: string; value: string }>;
	renderDisplay?: (value: T) => React.ReactNode;
	type?: "text" | "number" | "textarea" | "select" | "month";
	value: T;
};

type EditableFieldProps<T> = EditableFieldBaseProps<T> & {
	parse?: (raw: string) => T;
};

export function EditableField<T>({
	className = "",
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

	const isLoading = isSaving || externalLoading;

	const display = renderDisplay
		? renderDisplay(value)
		: format
			? format(value)
			: String(value ?? "");

	const applyRawValue = (raw: string) => {
		if (parse) {
			setTempValue(parse(raw));
			return;
		}
		// SAFETY: omitted `parse` is only valid when T is string (conditional prop type).
		setTempValue(raw as T);
	};

	return (
		<div className={`group flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6 ${className}`}>
			{label && (
				<div className="text-muted-foreground w-24 shrink-0 pt-1 text-sm font-semibold sm:w-32">
					{label}
				</div>
			)}
			{!isEditing ? (
				<div className="flex min-h-[2rem] flex-1 items-center justify-between">
					<span className="text-foreground text-base leading-relaxed font-medium">{display}</span>
					<Button
						className="hover:bg-muted/50 opacity-60 transition-all duration-200 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
						onClick={() => start(value)}
						size="icon"
						variant="ghost"
					>
						<Edit2 className="h-4 w-4" />
					</Button>
				</div>
			) : (
				<div className="relative flex flex-1 items-center gap-3">
					{isLoading && (
						<div className="rounded-base bg-background/50 pointer-events-none absolute inset-0 z-10" />
					)}
					{type === "textarea" ? (
						<Textarea
							className="text-foreground min-w-0 flex-1 text-base font-medium disabled:opacity-60"
							disabled={isLoading}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								applyRawValue(e.target.value)
							}
							rows={3}
							value={String(tempValue ?? "")}
						/>
					) : type === "select" ? (
						<Select
							disabled={isLoading}
							onValueChange={applyRawValue}
							value={String(tempValue ?? "")}
						>
							<SelectTrigger className="text-foreground min-w-0 flex-1 text-base font-medium disabled:opacity-60">
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
							className="text-foreground min-w-0 flex-1 text-base font-medium disabled:opacity-60"
							disabled={isLoading}
							onChange={(e) => applyRawValue(e.target.value)}
							step={type === "number" ? "0.01" : undefined}
							type={type}
							value={String(tempValue ?? "")}
						/>
					)}
					<div className="flex flex-shrink-0 gap-1">
						<Button
							className="h-8 w-8 hover:bg-green-600"
							disabled={isLoading}
							onClick={save}
							size="icon"
							variant="default"
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Check className="h-3 w-3" />
							)}
						</Button>
						<Button
							className="h-8 w-8 hover:bg-red-600"
							disabled={isLoading}
							onClick={cancel}
							size="icon"
							variant="destructive"
						>
							<X className="h-3 w-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
