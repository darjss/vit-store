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

type EditableFieldProps<T> = {
	label?: string;
	value: T;
	type?: "text" | "number" | "textarea" | "select";
	options?: { value: string; label: string }[];
	onSave: (next: T) => void | Promise<void>;
	format?: (value: T) => string;
	parse?: (raw: string) => T;
	renderDisplay?: (value: T) => React.ReactNode;
	className?: string;
	isLoading?: boolean;
};

export function EditableField<T>({
	label,
	value,
	type = "text",
	options,
	onSave,
	format,
	parse,
	renderDisplay,
	className = "",
	isLoading = false,
}: EditableFieldProps<T>) {
	const { isEditing, tempValue, setTempValue, start, cancel, save } =
		useEditableField<T>({ initialValue: value, onSave });

	const display = renderDisplay
		? renderDisplay(value)
		: format
			? format(value)
			: String(value ?? "");

	return (
		<div
			className={`group flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6 ${className}`}
		>
			{label && (
				<div className="w-24 shrink-0 pt-1 font-semibold text-muted-foreground text-sm sm:w-32">
					{label}
				</div>
			)}
			{!isEditing ? (
				<div className="flex min-h-[2rem] flex-1 items-center justify-between">
					<span className="font-medium text-base text-foreground leading-relaxed">
						{display}
					</span>
					<Button
						onClick={() => start(value)}
						size="icon"
						variant="ghost"
						className="opacity-60 transition-all duration-200 hover:bg-muted/50 hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
					>
						<Edit2 className="h-4 w-4" />
					</Button>
				</div>
			) : (
				<div className="flex flex-1 items-center gap-3">
					{type === "textarea" ? (
						<Textarea
							value={String(tempValue ?? "")}
							onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
								setTempValue(
									parse
										? parse(e.target.value)
										: (e.target.value as unknown as T),
								)
							}
							rows={3}
							className="min-w-0 flex-1 font-medium text-base text-foreground"
						/>
					) : type === "select" ? (
						<Select
							value={String(tempValue ?? "")}
							onValueChange={(value) =>
								setTempValue(parse ? parse(value) : (value as unknown as T))
							}
						>
							<SelectTrigger className="min-w-0 flex-1 font-medium text-base text-foreground">
								<SelectValue placeholder="Select an option" />
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
							type={type}
							value={String(tempValue ?? "")}
							onChange={(e) =>
								setTempValue(
									parse
										? parse(e.target.value)
										: (e.target.value as unknown as T),
								)
							}
							className="min-w-0 flex-1 font-medium text-base text-foreground"
							step={type === "number" ? "0.01" : undefined}
						/>
					)}
					<div className="flex flex-shrink-0 gap-1">
						<Button
							onClick={save}
							size="icon"
							variant="default"
							disabled={isLoading}
							className="h-8 w-8 hover:bg-green-600"
						>
							{isLoading ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Check className="h-3 w-3" />
							)}
						</Button>
						<Button
							onClick={cancel}
							size="icon"
							variant="destructive"
							disabled={isLoading}
							className="h-8 w-8 hover:bg-red-600"
						>
							<X className="h-3 w-3" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export default EditableField;
