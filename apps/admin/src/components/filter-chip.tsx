import { Check, ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// The chip turns dark and shows the picked value whenever it differs from `idle`.
export function FilterChip<T extends string>({
	idle,
	label,
	onChange,
	options,
	value,
}: {
	idle: T;
	label: string;
	onChange: (value: T) => void;
	options: ReadonlyArray<{ label: string; value: T }>;
	value: T;
}) {
	const active = value !== idle;
	const current = options.find((option) => option.value === value);
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger className={chipClass(active)}>
				<span className="max-w-40 truncate">{active && current ? current.label : label}</span>
				<ChevronDown className="size-3.5 shrink-0 opacity-60" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="max-h-80 w-60 overflow-y-auto border p-1">
				{options.map((option) => (
					<DropdownMenuItem
						className="gap-2 py-2 text-sm"
						key={option.value}
						onSelect={() => onChange(option.value)}
					>
						<Check className={cn("size-4", option.value === value ? "opacity-100" : "opacity-0")} />
						{option.label}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export const chipClass = (active: boolean) =>
	cn(
		"flex h-9 shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm whitespace-nowrap",
		active
			? "border-foreground bg-foreground text-white"
			: "text-foreground hover:border-foreground border-input bg-white",
	);
