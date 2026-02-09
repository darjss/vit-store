import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ArrayInputProps {
	form: UseFormReturn<any>;
	name: string;
	label: string;
	placeholder?: string;
	maxItems?: number;
}

export function ArrayInput({
	form,
	name,
	label,
	placeholder = "Шинэ утга...",
	maxItems = 50,
}: ArrayInputProps) {
	const [newValue, setNewValue] = useState("");
	const values: string[] = form.watch(name) || [];

	const handleAdd = () => {
		if (!newValue.trim()) return;
		if (values.length >= maxItems) return;

		const updated = [...values, newValue.trim()];
		form.setValue(name, updated, { shouldValidate: true });
		setNewValue("");
	};

	const handleRemove = (index: number) => {
		const updated = values.filter((_, i) => i !== index);
		form.setValue(name, updated, { shouldValidate: true });
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAdd();
		}
	};

	const inputId = `array-input-${name}`;

	return (
		<div className="space-y-2">
			<label htmlFor={inputId} className="font-bold text-sm">
				{label}
			</label>

			<div className="flex gap-2">
				<Input
					id={inputId}
					value={newValue}
					onChange={(e) => setNewValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					className="flex-1"
				/>
				<Button
					type="button"
					variant="outline"
					size="icon"
					onClick={handleAdd}
					disabled={!newValue.trim() || values.length >= maxItems}
				>
					<Plus className="h-4 w-4" />
				</Button>
			</div>

			{values.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{values.map((value, index) => (
						<div
							key={`${value}-${index}`}
							className={cn(
								"group flex items-center gap-1 border-2 border-border bg-muted/50 px-2 py-1 text-sm",
								"hover:border-destructive hover:bg-destructive/10",
							)}
						>
							<span className="max-w-[200px] truncate">{value}</span>
							<button
								type="button"
								onClick={() => handleRemove(index)}
								className="ml-0.5 text-muted-foreground opacity-50 transition-opacity hover:text-destructive group-hover:opacity-100"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Count */}
			<p className="text-muted-foreground text-xs">
				{values.length} / {maxItems}
			</p>
		</div>
	);
}

interface TagsInputProps {
	form: UseFormReturn<any>;
	name: string;
	label: string;
	placeholder?: string;
	suggestions?: string[];
	maxItems?: number;
}

export function TagsInput({
	form,
	name,
	label,
	placeholder = "Таг нэмэх...",
	suggestions = [],
	maxItems = 20,
}: TagsInputProps) {
	const [newValue, setNewValue] = useState("");
	const [showSuggestions, setShowSuggestions] = useState(false);
	const values: string[] = form.watch(name) || [];

	const filteredSuggestions = suggestions.filter(
		(s) =>
			s.toLowerCase().includes(newValue.toLowerCase()) && !values.includes(s),
	);

	const handleAdd = (value: string) => {
		const trimmed = value.trim();
		if (!trimmed) return;
		if (values.includes(trimmed)) return;
		if (values.length >= maxItems) return;

		const updated = [...values, trimmed];
		form.setValue(name, updated, { shouldValidate: true });
		setNewValue("");
		setShowSuggestions(false);
	};

	const handleRemove = (index: number) => {
		const updated = values.filter((_, i) => i !== index);
		form.setValue(name, updated, { shouldValidate: true });
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAdd(newValue);
		}
	};

	const inputId = `tags-input-${name}`;

	return (
		<div className="space-y-2">
			<label htmlFor={inputId} className="font-bold text-sm">
				{label}
			</label>

			{/* Input with suggestions */}
			<div className="relative">
				<div className="flex gap-2">
					<Input
						id={inputId}
						value={newValue}
						onChange={(e) => {
							setNewValue(e.target.value);
							setShowSuggestions(true);
						}}
						onFocus={() => setShowSuggestions(true)}
						onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
						onKeyDown={handleKeyDown}
						placeholder={placeholder}
						className="flex-1"
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onClick={() => handleAdd(newValue)}
						disabled={!newValue.trim() || values.length >= maxItems}
					>
						<Plus className="h-4 w-4" />
					</Button>
				</div>

				{/* Suggestions dropdown */}
				{showSuggestions && filteredSuggestions.length > 0 && (
					<div className="absolute top-full right-0 left-0 z-10 mt-1 max-h-40 overflow-y-auto border-2 border-border bg-background shadow-hard-sm">
						{filteredSuggestions.slice(0, 8).map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								onClick={() => handleAdd(suggestion)}
								className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
							>
								{suggestion}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Tags */}
			{values.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{values.map((value, index) => (
						<div
							key={`${value}-${index}`}
							className={cn(
								"group flex items-center gap-1 border-2 border-primary bg-primary/20 px-2 py-0.5 text-sm",
								"hover:border-destructive hover:bg-destructive/10",
							)}
						>
							<span className="max-w-[150px] truncate font-medium">
								#{value}
							</span>
							<button
								type="button"
								onClick={() => handleRemove(index)}
								className="ml-0.5 text-muted-foreground opacity-50 transition-opacity hover:text-destructive group-hover:opacity-100"
							>
								<X className="h-3 w-3" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Count */}
			<p className="text-muted-foreground text-xs">
				{values.length} / {maxItems}
			</p>
		</div>
	);
}
