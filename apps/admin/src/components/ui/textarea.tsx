import React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
	type = "text",
	placeholder = "Enter text...",
	className = "",
	...props
}) {
	return (
		<textarea
			placeholder={placeholder}
			rows={4}
			className={cn(
				"w-full border-2 border-border px-4 py-2 shadow-md transition placeholder:text-muted-foreground focus:shadow-xs focus:outline-hidden",
				className,
			)}
			{...props}
		/>
	);
}
