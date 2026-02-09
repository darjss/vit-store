import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import React, { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
	"flex cursor-pointer items-center justify-center font-heading font-bold outline-hidden transition-all active:translate-y-1 active:shadow-none",
	{
		variants: {
			variant: {
				default:
					"border-2 border-border bg-primary text-primary-foreground shadow-hard hover:translate-y-1 hover:shadow-none",
				secondary:
					"border-2 border-border bg-secondary text-secondary-foreground shadow-hard hover:translate-y-1 hover:shadow-none",
				outline:
					"border-2 border-border bg-background text-foreground shadow-hard hover:translate-y-1 hover:shadow-none",
				ghost: "bg-transparent hover:bg-muted/50",
				destructive:
					"border-2 border-destructive bg-destructive text-destructive-foreground shadow-hard hover:translate-y-1 hover:shadow-none",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-11 px-6 py-3",
				sm: "h-9 px-4 text-xs",
				lg: "h-12 px-8 text-lg",
				icon: "h-11 w-11 p-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface IButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, IButtonProps>(
	(
		{
			children,
			size,
			className = "",
			variant,
			asChild = false,
			...props
		}: IButtonProps,
		forwardedRef,
	) => {
		const Comp = asChild ? Slot : "button";
		return (
			<Comp
				ref={forwardedRef}
				className={cn(buttonVariants({ variant, size }), className)}
				{...props}
			>
				{children}
			</Comp>
		);
	},
);

Button.displayName = "Button";
