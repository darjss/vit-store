import { useRef } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search, X } from "lucide-react";

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
		// fallback demo action
		if (!onSubmit) console.log("search:", value);
	};

	const clearInput = () => {
		if (inputRef.current) {
			inputRef.current.value = "";
			inputRef.current.focus();
		}
	};

	return (
		<div className="group relative flex items-center">
			<div className="pointer-events-none absolute left-3 text-gray-500 group-focus-within:text-gray-700 dark:text-gray-400 dark:group-focus-within:text-gray-200">
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
					className="hidden h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black group-has-[input:not(:placeholder-shown)]:flex dark:hover:bg-gray-800"
					onClick={clearInput}
					type="button"
				>
					<X className="h-4 w-4" />
				</button>

				<Button
					variant="noShadow"
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
