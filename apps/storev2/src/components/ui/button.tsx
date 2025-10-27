import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import type { HTMLAttributes } from "preact/compat";
import { forwardRef } from "preact/compat";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"flex cursor-pointer items-center rounded font-head font-medium outline-hidden transition-all duration-200",
	{
		variants: {
			variant: {
				default:
					"border-2 border-black bg-primary text-primary-foreground shadow-md transition hover:translate-y-1 hover:bg-primary-hover hover:shadow active:translate-x-1 active:translate-y-2 active:shadow-none",
				secondary:
					"border-2 border-black bg-secondary text-secondary-foreground shadow-md shadow-primary transition hover:translate-y-1 hover:bg-secondary-hover hover:shadow active:translate-x-1 active:translate-y-2 active:shadow-none",
				outline:
					"border-2 bg-transparent shadow-md transition hover:translate-y-1 hover:shadow active:translate-x-1 active:translate-y-2 active:shadow-none",
				link: "bg-transparent hover:underline",
			},
			size: {
				sm: "px-3 py-1 text-sm shadow hover:shadow-none",
				md: "px-4 py-1.5 text-base",
				lg: "px-6 py-2 text-md lg:px-8 lg:py-3 lg:text-lg",
				icon: "p-2",
			},
		},
		defaultVariants: {
			size: "md",
			variant: "default",
		},
	},
);

export interface IButtonProps
	extends Omit<HTMLAttributes<HTMLButtonElement>, "children">,
		VariantProps<typeof buttonVariants> {
	children?: ComponentChildren;
}

export const Button = forwardRef<HTMLButtonElement, IButtonProps>(
	(
		{
			children,
			size = "md",
			className = "",
			variant = "default",
			...props
		}: IButtonProps,
		ref,
	) => {
		return (
			<button
				ref={ref}
				className={cn(buttonVariants({ variant, size }), className)}
				{...props}
			>
				{children}
			</button>
		);
	},
);

Button.displayName = "Button";
