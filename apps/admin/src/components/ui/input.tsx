import type React from "react";
import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	className?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
	(
		{ type = "text", placeholder = "Enter text", className = "", ...props },
		ref,
	) => {
		return (
			<input
				ref={ref}
				type={type}
				placeholder={placeholder}
				className={cn(
					"flex h-10 w-full rounded-none border-2 border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
					"shadow-hard transition-all focus:shadow-none focus:translate-y-1",
					props["aria-invalid"] ? "border-destructive text-destructive shadow-destructive shadow-xs" : "",
					className,
				)}
				{...props}
			/>
		);
	},
);

Input.displayName = "Input";
