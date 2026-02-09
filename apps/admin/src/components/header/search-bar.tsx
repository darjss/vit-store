import { Search, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Props = {
	autoFocus?: boolean;
	placeholder?: string;
	onSubmit?: (value: string) => void;
};

const SearchBar = ({
	autoFocus = false,
	placeholder = "Search",
	onSubmit,
}: Props) => {
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = () => {
		const value = inputRef.current?.value?.trim() ?? "";
		if (!value) return;
		if (onSubmit) onSubmit(value);
	};

	const clearInput = () => {
		if (inputRef.current) {
			inputRef.current.value = "";
			inputRef.current.focus();
		}
	};

	return (
		<div className="group relative flex items-center">
			<div className="pointer-events-none absolute left-3 text-foreground/60 group-focus-within:text-foreground">
				<Search className="h-4 w-4" />
			</div>

			<Input
				ref={inputRef}
				type="text"
				autoFocus={autoFocus}
				placeholder={placeholder}
				className="h-10 w-full rounded-base pr-10 pl-9"
				onKeyDown={(e) => {
					if (e.key === "Enter") handleSubmit();
					if (e.key === "Escape") clearInput();
				}}
				aria-label="Search"
			/>

			<div className="absolute right-1 flex items-center gap-1">
				<button
					aria-label="Clear search"
					className="hidden h-8 w-8 items-center justify-center rounded-base text-foreground/60 ring-offset-background hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-has-[input:not(:placeholder-shown)]:flex"
					onClick={clearInput}
					type="button"
				>
					<X className="h-4 w-4" />
				</button>

				<Button
					variant="secondary"
					size="sm"
					className="h-8"
					onClick={handleSubmit}
					aria-label="Submit search"
					type="button"
				>
					<Search className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
};

export default SearchBar;
