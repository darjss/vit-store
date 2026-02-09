import { cva, type VariantProps } from "class-variance-authority";
import React, { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center border-2 px-2.5 py-0.5 font-bold font-heading text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground shadow-hard hover:translate-y-0.5 hover:shadow-none",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
				outline: "text-foreground",
				solid: "border-border bg-foreground text-background",
				surface: "bg-primary text-primary-foreground border-border",
			},
			size: {
				sm: "px-2 py-0.5 text-[10px]",
				md: "px-2.5 py-0.5 text-xs",
				lg: "px-3 py-1 text-sm",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "md",
		},
	},
);

interface BadgeProps
	extends HTMLAttributes<HTMLSpanElement>,
		VariantProps<typeof badgeVariants> {}

export function Badge({
	children,
	size = "md",
	variant = "default",
	className = "",
	...props
}: BadgeProps) {
	return (
		<span
			className={cn(badgeVariants({ variant, size }), className)}
			{...props}
		>
			{children}
		</span>
	);
}
